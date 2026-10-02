import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.feedback import Feedback
from app.models.order import Order
from app.models.user import User, AuditEvent
from app.models.engagement import Notification
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_db():
    db = TestingSessionLocal()
    db.query(AuditEvent).delete()
    db.query(Notification).delete()
    db.query(Feedback).delete()
    db.query(Order).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def create_user(db, email="customer@example.com", is_superuser=False, role="customer"):
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=get_password_hash("Pass123!"),
        full_name="Engineering Customer",
        phone="9876543210",
        is_active=True,
        is_superuser=is_superuser,
        role=role if is_superuser else "customer",
        status="verified",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def auth_headers_for(user_id: str, role: str = "customer", is_admin: bool = False):
    aud = "admin" if is_admin else "customer"
    token = create_access_token(
        subject=user_id,
        role=role,
        is_admin=is_admin,
        audience=aud,
    )
    return {"Authorization": f"Bearer {token}"}


def test_submit_feedback_authenticated():
    db = TestingSessionLocal()
    user = create_user(db, email="builder@venopai.com")
    u_id = str(user.id)
    u_role = user.role
    db.close()

    headers = auth_headers_for(u_id, u_role, is_admin=False)
    payload = {
        "feedback_type": "bug_report",
        "subject": "Cart total calculation bug",
        "description": "On mobile Safari, the subtotal does not update when increasing quantity from 1 to 2.",
        "page_url": "/cart",
    }
    resp = client.post("/api/v1/feedback", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["subject"] == "Cart total calculation bug"
    assert data["feedback_type"] == "bug_report"
    assert data["priority"] == "high"  # auto-assigned high for bug_report
    assert data["status"] == "open"


def test_submit_feedback_guest():
    payload = {
        "feedback_type": "feature_request",
        "subject": "Request for KiCad plugin support",
        "description": "It would be great to export BOM directly from KiCad into VenopAI cart.",
        "guest_name": "Suresh Raina",
        "guest_email": "suresh@kicad-community.org",
    }
    resp = client.post("/api/v1/feedback", json=payload)
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["priority"] == "low"  # auto-assigned low for feature_request
    assert data["status"] == "open"


def test_submit_feedback_guest_missing_email():
    payload = {
        "feedback_type": "feature_request",
        "subject": "Missing export button",
        "description": "Please add a CSV export button on the products page.",
    }
    resp = client.post("/api/v1/feedback", json=payload)
    assert resp.status_code == 400
    assert "EMAIL_REQUIRED" in resp.text or "Email address is required" in resp.text


def test_submit_feedback_validation():
    payload = {
        "feedback_type": "bug_report",
        "subject": "No",  # too short (<3 chars)
        "description": "x",
        "guest_email": "test@test.com",
    }
    resp = client.post("/api/v1/feedback", json=payload)
    assert resp.status_code == 422 or resp.status_code == 400


def test_submit_feedback_invalid_type():
    payload = {
        "feedback_type": "random_unsupported_type",
        "subject": "Random feedback subject",
        "description": "Detailed description of something that is not broken.",
        "guest_email": "test@test.com",
    }
    resp = client.post("/api/v1/feedback", json=payload)
    assert resp.status_code == 400
    assert "INVALID_FEEDBACK_TYPE" in resp.text


def test_priority_auto_assignment():
    db = TestingSessionLocal()
    user = create_user(db, email="tester@venopai.com")
    u_id = str(user.id)
    u_role = user.role
    db.close()

    headers = auth_headers_for(u_id, u_role, is_admin=False)
    # Payment issue should be critical
    p_resp = client.post(
        "/api/v1/feedback",
        json={
            "feedback_type": "payment_issue",
            "subject": "Razorpay payment deducted but order failed",
            "description": "Bank deducted 4500 INR but page redirected to error state.",
        },
        headers=headers,
    )
    assert p_resp.status_code == 201
    assert p_resp.json()["data"]["priority"] == "critical"


def test_list_own_feedback():
    db = TestingSessionLocal()
    user = create_user(db, email="user_a@venopai.com")
    u_id = str(user.id)
    u_role = user.role
    db.close()

    headers = auth_headers_for(u_id, u_role, is_admin=False)
    # Submit 2 feedbacks
    client.post(
        "/api/v1/feedback",
        json={"feedback_type": "ui_ux_suggestion", "subject": "Dark mode contrast", "description": "Border contrast in dark mode could be higher."},
        headers=headers,
    )
    client.post(
        "/api/v1/feedback",
        json={"feedback_type": "general_feedback", "subject": "Great fast shipping", "description": "Received microcontrollers in 2 days, excellent packaging."},
        headers=headers,
    )

    resp = client.get("/api/v1/feedback", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 2
    assert resp.json()["pagination"]["total_items"] == 2


def test_idor_feedback_isolation():
    db = TestingSessionLocal()
    user_a = create_user(db, email="user_a@test.com")
    user_b = create_user(db, email="user_b@test.com")
    u_a_id = str(user_a.id)
    u_a_role = user_a.role
    u_b_id = str(user_b.id)
    u_b_role = user_b.role
    db.close()

    headers_a = auth_headers_for(u_a_id, u_a_role, is_admin=False)
    headers_b = auth_headers_for(u_b_id, u_b_role, is_admin=False)

    create_resp = client.post(
        "/api/v1/feedback",
        json={"feedback_type": "bug_report", "subject": "Confidential hardware design issue", "description": "Layer stackup parsing error on gerber upload."},
        headers=headers_a,
    )
    feedback_id = create_resp.json()["data"]["id"]

    # User B tries to view User A's feedback
    idor_resp = client.get(f"/api/v1/feedback/{feedback_id}", headers=headers_b)
    assert idor_resp.status_code == 403


def test_admin_list_feedbacks_with_filters():
    db = TestingSessionLocal()
    admin = create_user(db, email="admin@venopai.com", is_superuser=True, role="SUPER_ADMIN")
    user = create_user(db, email="customer1@venopai.com")
    a_id = str(admin.id)
    a_role = admin.role
    u_id = str(user.id)
    u_role = user.role
    db.close()

    u_headers = auth_headers_for(u_id, u_role, is_admin=False)
    a_headers = auth_headers_for(a_id, a_role, is_admin=True)

    client.post(
        "/api/v1/feedback",
        json={"feedback_type": "bug_report", "subject": "Broken checkout button", "description": "Clicking pay does nothing on Edge."},
        headers=u_headers,
    )
    client.post(
        "/api/v1/feedback",
        json={"feedback_type": "payment_issue", "subject": "Double charged by gateway", "description": "Two transaction SMS received."},
        headers=u_headers,
    )

    # Admin list all
    resp = client.get("/api/v1/admin/feedback", headers=a_headers)
    assert resp.status_code == 200
    assert len(resp.json()["data"]) == 2

    # Filter by priority=critical
    crit_resp = client.get("/api/v1/admin/feedback?priority=critical", headers=a_headers)
    assert crit_resp.status_code == 200
    assert len(crit_resp.json()["data"]) == 1
    assert crit_resp.json()["data"][0]["feedback_type"] == "payment_issue"


def test_admin_update_feedback():
    db = TestingSessionLocal()
    admin = create_user(db, email="admin@venopai.com", is_superuser=True, role="SUPER_ADMIN")
    user = create_user(db, email="client@venopai.com")
    a_id = str(admin.id)
    a_role = admin.role
    u_id = str(user.id)
    u_role = user.role
    db.close()

    u_headers = auth_headers_for(u_id, u_role, is_admin=False)
    a_headers = auth_headers_for(a_id, a_role, is_admin=True)

    create_resp = client.post(
        "/api/v1/feedback",
        json={"feedback_type": "bug_report", "subject": "Search query with spaces fails", "description": "Searching for STM32 F4 gives zero results."},
        headers=u_headers,
    )
    feedback_id = create_resp.json()["data"]["id"]

    # Admin marks as resolved
    patch_resp = client.patch(
        f"/api/v1/admin/feedback/{feedback_id}",
        json={
            "status": "resolved",
            "admin_notes": "Fixed search regex tokenizer in search service.",
            "admin_response": "We have updated the catalog search to support multi-word queries. Please test again!",
        },
        headers=a_headers,
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()["data"]
    assert updated["status"] == "resolved"
    assert updated["admin_notes"] == "Fixed search regex tokenizer in search service."
    assert updated["resolved_at"] is not None


def test_admin_feedback_stats():
    db = TestingSessionLocal()
    admin = create_user(db, email="super@venopai.com", is_superuser=True, role="SUPER_ADMIN")
    a_id = str(admin.id)
    a_role = admin.role
    db.close()

    a_headers = auth_headers_for(a_id, a_role, is_admin=True)

    # Guest submission of bug report
    client.post(
        "/api/v1/feedback",
        json={
            "feedback_type": "bug_report",
            "subject": "Missing pinout diagram",
            "description": "ESP32-S3 product page is missing pinout graphics.",
            "guest_email": "guest@iot.org",
        },
    )

    stats_resp = client.get("/api/v1/admin/feedback/stats", headers=a_headers)
    assert stats_resp.status_code == 200
    stats = stats_resp.json()["data"]
    assert stats["total"] >= 1
    assert stats["open"] >= 1
    assert "bug_report" in stats["by_type"]


def test_feedback_with_order_linking():
    db = TestingSessionLocal()
    user_a = create_user(db, email="order_owner@test.com")
    user_b = create_user(db, email="order_stranger@test.com")
    u_a_id = str(user_a.id)
    u_a_role = user_a.role
    u_b_id = str(user_b.id)
    u_b_role = user_b.role

    # Create an order for user_a
    order = Order(
        id=uuid.uuid4(),
        user_id=user_a.id,
        order_number="ORD-TEST-9999",
        status="delivered",
        total_paise=120000,
        subtotal_paise=100000,
        tax_amount_paise=18000,
        shipping_rate_paise=2000,
        shipping_address_snapshot='{"line1": "123 Tech Park"}',
    )
    db.add(order)
    db.commit()
    order_id = str(order.id)
    db.close()

    # User A links their own order
    headers_a = auth_headers_for(u_a_id, u_a_role, is_admin=False)
    ok_resp = client.post(
        "/api/v1/feedback",
        json={
            "feedback_type": "order_issue",
            "subject": "Wrong quantity delivered",
            "description": "Package arrived with 5 pieces instead of 10.",
            "order_id": order_id,
        },
        headers=headers_a,
    )
    assert ok_resp.status_code == 201
    assert ok_resp.json()["data"]["order_id"] == order_id

    # User B tries to link User A's order -> forbidden 403
    headers_b = auth_headers_for(u_b_id, u_b_role, is_admin=False)
    forbidden_resp = client.post(
        "/api/v1/feedback",
        json={
            "feedback_type": "order_issue",
            "subject": "Trying to claim stranger order",
            "description": "Malicious reference attempt.",
            "order_id": order_id,
        },
        headers=headers_b,
    )
    assert forbidden_resp.status_code == 403


def test_non_admin_cannot_access_admin_endpoints():
    db = TestingSessionLocal()
    user = create_user(db, email="standard_customer@test.com")
    u_id = str(user.id)
    u_role = user.role
    db.close()

    headers = auth_headers_for(u_id, u_role, is_admin=False)
    resp = client.get("/api/v1/admin/feedback", headers=headers)
    assert resp.status_code == 403
