import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User, AuditEvent
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
    assert approve_res.json()["data"]["status"] == "accepted"

    db.refresh(mfg)
    assert mfg.status in ("payment_pending", "quote_accepted")


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
