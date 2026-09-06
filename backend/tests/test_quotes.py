import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User, AuditEvent, Address
from app.models.project import Project, Quote, QuoteVersion, QuoteApproval, ManufacturingRequest
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_quotes_db():
    db = TestingSessionLocal()
    db.query(QuoteApproval).delete()
    db.query(QuoteVersion).delete()
    db.query(Quote).delete()
    db.query(ManufacturingRequest).delete()
    db.query(Project).delete()
    db.query(AuditEvent).delete()
    db.query(Address).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def create_customer(db, email="customer@example.com"):
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=get_password_hash("ValidPass123!"),
        full_name="Verified Customer",
        is_active=True,
        status="verified",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(subject=str(user.id), role="customer", audience="customer")
    return user, token


def create_admin(db, email="admin@venopai.com", role="MANUFACTURING_MANAGER"):
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=get_password_hash("AdminPass123!"),
        full_name="Mfg Admin",
        is_active=True,
        is_superuser=True,
        role=role,
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        is_admin=True,
        audience="admin",
    )
    return user, token


def test_quote_draft_send_approve_lifecycle():
    db = TestingSessionLocal()
    user, user_token = create_customer(db)
    admin, admin_token = create_admin(db)

    # 1. Create a manufacturing request
    mfg = ManufacturingRequest(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Custom Enclosure",
        project_overview="Aluminum milled box",
        prototype_type="cnc_machining",
        quantity=10,
        status="under_review",
    )
    db.add(mfg)
    db.commit()

    # 2. Admin creates quote draft (ADMIN-QUOTE-API-001)
    create_res = client.post(
        "/api/v1/admin/quotes",
        json={
            "request_type": "manufacturing",
            "request_id": str(mfg.id),
            "line_items": [
                {"name": "Tooling & CNC Milling", "amount": "10000.00"},
                {"name": "Anodizing Finishing", "amount": "2000.00"},
            ],
            "shipping_amount": "500.00",
            "estimated_timeline": "14 business days",
            "valid_until": "2026-12-31T23:59:59Z",
            "terms": "50% advance, 50% on dispatch",
            "scope_summary": "10x Aluminum Cases with Type II Anodize",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create_res.status_code == 201
    quote_id = create_res.json()["data"]["id"]
    assert create_res.json()["data"]["status"] == "draft"

    # Verify calculations: subtotal = 12,000, shipping = 500, tax (18% on 12500) = 2,250 -> total = 14,750
    db.refresh(mfg)
    quote = db.query(Quote).filter(Quote.id == uuid.UUID(quote_id)).first()
    assert quote is not None
    assert len(quote.versions) == 1
    v1 = quote.versions[0]
    assert v1.subtotal_paise == 1200000
    assert v1.shipping_amount_paise == 50000
    assert v1.tax_paise == 225000
    assert v1.total_amount == 1475000

    # 3. Admin sends quote to customer (ADMIN-QUOTE-API-003)
    send_res = client.post(
        f"/api/v1/admin/quotes/{quote_id}/send",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert send_res.status_code == 200
    assert send_res.json()["data"]["status"] == "sent"

    # Manufacturing request status should be quote_ready / quote_issued
    db.refresh(mfg)
    assert mfg.status in ("quote_ready", "quote_issued")

    # 4. Customer views quote detail (QUOTE-API-002)
    view_res = client.get(
        f"/api/v1/quotes/{quote_id}",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert view_res.status_code == 200
    q_data = view_res.json()["data"]
    assert q_data["status"] == "sent"
    assert q_data["current_version"]["version_number"] == 1
    assert q_data["current_version"]["subtotal"] == "12000.00"

    # 5. Customer approves quote (QUOTE-API-005)
    approve_res = client.post(
        f"/api/v1/quotes/{quote_id}/approve",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["data"]["status"] == "approved"

    db.refresh(mfg)
    assert mfg.status == "payment_pending"


def test_quote_revision_versioning():
    db = TestingSessionLocal()
    user, user_token = create_customer(db)
    admin, admin_token = create_admin(db)

    mfg = ManufacturingRequest(
        id=uuid.uuid4(),
        user_id=user.id,
        title="PCB Assembly",
        project_overview="4-layer rigid board",
        prototype_type="pcb_fabrication",
        quantity=50,
        status="under_review",
    )
    db.add(mfg)
    db.commit()

    # Create & send v1
    create_res = client.post(
        "/api/v1/admin/quotes",
        json={
            "request_type": "manufacturing",
            "request_id": str(mfg.id),
            "line_items": [{"name": "PCBA Fab", "amount": "5000.00"}],
            "terms": "Standard terms",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    quote_id = create_res.json()["data"]["id"]
    client.post(f"/api/v1/admin/quotes/{quote_id}/send", headers={"Authorization": f"Bearer {admin_token}"})

    # Customer rejects v1 (QUOTE-API-006)
    reject_res = client.post(
        f"/api/v1/quotes/{quote_id}/reject",
        json={"reason": "Need lower unit cost"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert reject_res.status_code == 200
    db.refresh(mfg)
    assert mfg.status == "clarification_needed"

    # Admin revises quote to v2 (ADMIN-QUOTE-API-004)
    revise_res = client.post(
        f"/api/v1/admin/quotes/{quote_id}/revise",
        json={
            "line_items": [{"name": "PCBA Fab (Volume Discount)", "amount": "4200.00"}],
            "terms": "Revised terms",
            "scope_summary": "Discount applied",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert revise_res.status_code == 201
    v2_data = revise_res.json()["data"]["current_version"]
    assert v2_data["version_number"] == 2
    assert v2_data["subtotal"] == "4200.00"

    # Check that previous version was marked superseded
    quote = db.query(Quote).filter(Quote.id == uuid.UUID(quote_id)).first()
    assert len(quote.versions) == 2
    assert quote.versions[0].status == "superseded"
    assert quote.versions[1].status in ("draft", "sent")


def test_quote_idor_isolation():
    db = TestingSessionLocal()
    user1, token1 = create_customer(db, "u1@example.com")
    user2, token2 = create_customer(db, "u2@example.com")
    admin, admin_token = create_admin(db)

    mfg = ManufacturingRequest(
        id=uuid.uuid4(),
        user_id=user1.id,
        title="Proprietary Device",
        project_overview="Confidential hardware",
        prototype_type="cnc_machining",
        quantity=1,
        status="under_review",
    )
    db.add(mfg)
    db.commit()

    create_res = client.post(
        "/api/v1/admin/quotes",
        json={
            "request_type": "manufacturing",
            "request_id": str(mfg.id),
            "line_items": [{"name": "Confidential Fab", "amount": "1000.00"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    quote_id = create_res.json()["data"]["id"]

    # User 2 attempts to view User 1's quote -> 404 (SEC-009)
    res = client.get(
        f"/api/v1/quotes/{quote_id}",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "QUOTE_NOT_FOUND"

    # User 2 attempts to approve User 1's quote -> 404
    approve_res = client.post(
        f"/api/v1/quotes/{quote_id}/approve",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert approve_res.status_code == 404


def test_admin_quote_draft_inplace_edit_and_lock():
    """ADMIN-QUOTE-API-002: In-place edit permitted on draft; locked once sent."""
    db = TestingSessionLocal()
    user, user_token = create_customer(db, "cust_edit@example.com")
    admin, admin_token = create_admin(db, "admin_edit@venopai.com")

    mfg = ManufacturingRequest(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Draft Test",
        project_overview="Overview",
        prototype_type="cnc_machining",
        quantity=1,
        status="under_review",
    )
    db.add(mfg)
    db.commit()

    # 1. Create quote draft
    create_res = client.post(
        "/api/v1/admin/quotes",
        json={
            "request_type": "manufacturing",
            "request_id": str(mfg.id),
            "line_items": [{"name": "Item A", "amount": "1000.00"}],
            "shipping_amount": "100.00",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create_res.status_code == 201
    quote_id = create_res.json()["data"]["id"]

    # 2. In-place edit while in draft (ADMIN-QUOTE-API-002)
    edit_res = client.patch(
        f"/api/v1/admin/quotes/{quote_id}/draft",
        json={
            "line_items": [
                {"name": "Item A", "amount": "1000.00"},
                {"name": "Item B", "amount": "500.00"},
            ],
            "shipping_amount": "150.00",
            "scope_summary": "Updated scope",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert edit_res.status_code == 200
    v_data = edit_res.json()["data"]
    assert v_data["version_number"] == 1
    assert v_data["subtotal"] == "1500.00"

    # Verify still only 1 version exists in DB
    quote = db.query(Quote).filter(Quote.id == uuid.UUID(quote_id)).first()
    assert len(quote.versions) == 1

    # 3. Send quote -> transitions to 'sent'
    send_res = client.post(
        f"/api/v1/admin/quotes/{quote_id}/send",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert send_res.status_code == 200

    # 4. Attempt in-place edit on sent quote -> 409 QUOTE_NOT_IN_DRAFT
    edit_fail = client.patch(
        f"/api/v1/admin/quotes/{quote_id}/draft",
        json={"line_items": [{"name": "Item X", "amount": "999.00"}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert edit_fail.status_code == 409
    assert edit_fail.json()["error"]["code"] in ("CANNOT_EDIT_NON_DRAFT", "QUOTE_NOT_IN_DRAFT")


def test_quote_stale_approval_conflict_409():
    """CORRECTION 6: Customer can only approve latest sent version; stale version returns 409."""
    db = TestingSessionLocal()
    user, user_token = create_customer(db, "cust_stale@example.com")
    admin, admin_token = create_admin(db, "admin_stale@venopai.com")

    mfg = ManufacturingRequest(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Stale Approval Test",
        project_overview="Overview",
        prototype_type="pcb_fabrication",
        quantity=10,
        status="under_review",
    )
    db.add(mfg)
    db.commit()

    # Create & send v1
    create_res = client.post(
        "/api/v1/admin/quotes",
        json={
            "request_type": "manufacturing",
            "request_id": str(mfg.id),
            "line_items": [{"name": "Initial run", "amount": "2000.00"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    quote_id = create_res.json()["data"]["id"]
    client.post(f"/api/v1/admin/quotes/{quote_id}/send", headers={"Authorization": f"Bearer {admin_token}"})

    # Admin revises quote -> creates v2 (v1 becomes superseded)
    client.post(
        f"/api/v1/admin/quotes/{quote_id}/revise",
        json={"line_items": [{"name": "Revised run", "amount": "1800.00"}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    # Customer attempts to approve stale version 1 -> 409 QUOTE_SUPERSEDED
    stale_approve = client.post(
        f"/api/v1/quotes/{quote_id}/approve",
        json={"version_number": 1},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert stale_approve.status_code == 409
    assert stale_approve.json()["error"]["code"] == "QUOTE_SUPERSEDED"

    # Customer approves latest version (v2) -> 200
    good_approve = client.post(
        f"/api/v1/quotes/{quote_id}/approve",
        json={"version_number": 2},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert good_approve.status_code == 200
    assert good_approve.json()["data"]["status"] == "approved"


def test_admin_quote_approvals_history():
    """ADMIN-QUOTE-API-005: Full approvals and rejections history across versions."""
    db = TestingSessionLocal()
    user, user_token = create_customer(db, "cust_appr@example.com")
    admin, admin_token = create_admin(db, "admin_appr@venopai.com")

    mfg = ManufacturingRequest(
        id=uuid.uuid4(),
        user_id=user.id,
        title="History Test",
        project_overview="Overview",
        prototype_type="cnc_machining",
        quantity=2,
        status="under_review",
    )
    db.add(mfg)
    db.commit()

    create_res = client.post(
        "/api/v1/admin/quotes",
        json={
            "request_type": "manufacturing",
            "request_id": str(mfg.id),
            "line_items": [{"name": "Part 1", "amount": "3000.00"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    quote_id = create_res.json()["data"]["id"]
    client.post(f"/api/v1/admin/quotes/{quote_id}/send", headers={"Authorization": f"Bearer {admin_token}"})

    # Customer rejects v1
    client.post(
        f"/api/v1/quotes/{quote_id}/reject",
        json={"reason": "Price too high for prototype"},
        headers={"Authorization": f"Bearer {user_token}"},
    )

    # Admin revises to v2
    client.post(
        f"/api/v1/admin/quotes/{quote_id}/revise",
        json={"line_items": [{"name": "Part 1 Discounted", "amount": "2500.00"}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    # Customer approves v2
    client.post(
        f"/api/v1/quotes/{quote_id}/approve",
        headers={"Authorization": f"Bearer {user_token}"},
    )

    # Admin checks approvals history (ADMIN-QUOTE-API-005)
    history_res = client.get(
        f"/api/v1/admin/quotes/{quote_id}/approvals",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert history_res.status_code == 200
    approvals = history_res.json()["data"]
    assert len(approvals) == 2
    statuses = [a["status"] for a in approvals]
    assert "APPROVED" in statuses
    assert "REJECTED" in statuses


def test_admin_quote_cancel_and_post_approval_lock():
    """ADMIN-QUOTE-API-006: Pre-approval quote cancel succeeds; approved quote locked with 409."""
    db = TestingSessionLocal()
    user, user_token = create_customer(db, "cust_cancel@example.com")
    admin, admin_token = create_admin(db, "admin_cancel@venopai.com")

    mfg = ManufacturingRequest(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Cancel Test",
        project_overview="Overview",
        prototype_type="cnc_machining",
        quantity=1,
        status="under_review",
    )
    db.add(mfg)
    db.commit()

    # 1. Create quote draft and cancel it
    create_res = client.post(
        "/api/v1/admin/quotes",
        json={
            "request_type": "manufacturing",
            "request_id": str(mfg.id),
            "line_items": [{"name": "Test Item", "amount": "500.00"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    quote_id = create_res.json()["data"]["id"]

    cancel_res = client.post(
        f"/api/v1/admin/quotes/{quote_id}/cancel",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["data"]["status"] == "cancelled"

    # Customer cannot approve cancelled quote
    appr_fail = client.post(
        f"/api/v1/quotes/{quote_id}/approve",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert appr_fail.status_code == 409

    # 2. Create another quote, send, and customer approves
    create_res2 = client.post(
        "/api/v1/admin/quotes",
        json={
            "request_type": "manufacturing",
            "request_id": str(mfg.id),
            "line_items": [{"name": "Approved Item", "amount": "700.00"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    quote2_id = create_res2.json()["data"]["id"]
    client.post(f"/api/v1/admin/quotes/{quote2_id}/send", headers={"Authorization": f"Bearer {admin_token}"})
    client.post(f"/api/v1/quotes/{quote2_id}/approve", headers={"Authorization": f"Bearer {user_token}"})

    # Admin attempts to cancel approved quote -> 409 CANNOT_CANCEL_APPROVED_QUOTE
    cancel_fail = client.post(
        f"/api/v1/admin/quotes/{quote2_id}/cancel",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert cancel_fail.status_code == 409
    assert cancel_fail.json()["error"]["code"] == "CANNOT_CANCEL_APPROVED_QUOTE"


def test_quote_centralized_tax_breakdown_and_destination_state():
    """CORRECTION 4: Quote tax uses central TaxService with dynamic state lookup."""
    db = TestingSessionLocal()
    user, user_token = create_customer(db, "cust_tax@example.com")
    admin, admin_token = create_admin(db, "admin_tax@venopai.com")

    # Add customer address in Karnataka (inter-state compared to Telangana)
    addr = Address(
        id=uuid.uuid4(),
        user_id=user.id,
        recipient_name="Interstate Customer",
        phone="9876543210",
        line1="123 MG Road",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        country="India",
        is_default=True,
    )
    db.add(addr)

    mfg = ManufacturingRequest(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Interstate Project",
        project_overview="Overview",
        prototype_type="cnc_machining",
        quantity=1,
        status="under_review",
    )
    db.add(mfg)
    db.commit()

    create_res = client.post(
        "/api/v1/admin/quotes",
        json={
            "request_type": "manufacturing",
            "request_id": str(mfg.id),
            "line_items": [{"name": "CNC Enclosure", "amount": "10000.00"}],
            "shipping_amount": "500.00",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create_res.status_code == 201
    quote_id = create_res.json()["data"]["id"]

    # Send and view quote detail
    client.post(f"/api/v1/admin/quotes/{quote_id}/send", headers={"Authorization": f"Bearer {admin_token}"})
    view_res = client.get(
        f"/api/v1/quotes/{quote_id}",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert view_res.status_code == 200
    q_data = view_res.json()["data"]

    # Check that tax was computed via central tax engine
    assert q_data["current_version"]["tax"]["type"] == "IGST"
    # 18% on 10,500 = 1,890.00
    assert q_data["current_version"]["tax"]["amount"] == "1890.00"
    assert q_data["current_version"]["total"] == "12390.00"

