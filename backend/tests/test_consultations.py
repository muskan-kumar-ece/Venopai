import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User, AuditEvent
from app.models.project import (
    Project,
    ProjectFile,
    Quote,
    QuoteVersion,
    QuoteApproval,
    ConsultationRequest,
    ConsultationClarification,
)
from app.core.security import get_password_hash, create_access_token
from app.workers.tasks.consultations import check_inactivity_auto_close
from tests.test_utils import TestingSessionLocal

def utcnow():
    return datetime.now(timezone.utc)

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_consult_db():
    db = TestingSessionLocal()
    db.query(ConsultationClarification).delete()
    db.query(ProjectFile).delete()
    db.query(QuoteApproval).delete()
    db.query(QuoteVersion).delete()
    db.query(Quote).delete()
    db.query(ConsultationRequest).delete()
    db.query(Project).delete()
    db.query(AuditEvent).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def create_customer(db, email="customer@example.com", is_verified=True):
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=get_password_hash("ValidPass123!"),
        full_name="Consult Customer",
        is_active=True,
        status="verified" if is_verified else "registered",
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
        full_name="Consult Admin",
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


def test_consultation_submission_unverified_customer_blocked():
    """Customer must be verified to submit consultation."""
    db = TestingSessionLocal()
    unverified, token = create_customer(db, is_verified=False)

    payload = {
        "topic": "Edge AI Architecture",
        "description": "Need advice on deploying YOLO models on STM32 MPUs.",
    }
    res = client.post(
        "/api/v1/consultations",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "EMAIL_NOT_VERIFIED"


def test_consultation_submission_and_detail():
    """Verified customer submits consultation and fetches detail."""
    db = TestingSessionLocal()
    customer, token = create_customer(db)

    payload = {
        "topic": "Power Optimization Architecture",
        "description": "Battery life optimization for wearable IoT monitor running on CR2032.",
        "project_id": None,
    }
    res = client.post(
        "/api/v1/consultations",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201
    data = res.json()["data"]
    consult_id = data["id"]
    assert data["topic"] == payload["topic"]
    assert data["status"] == "submitted"

    # List consultations
    res_list = client.get(
        "/api/v1/consultations",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_list.status_code == 200
    assert len(res_list.json()["data"]) == 1

    # Get detail
    res_detail = client.get(
        f"/api/v1/consultations/{consult_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_detail.status_code == 200
    assert res_detail.json()["data"]["id"] == consult_id


def test_consultation_idor_isolation():
    """Non-owner receives 404 on consultation detail."""
    db = TestingSessionLocal()
    customer1, token1 = create_customer(db, "c1@test.com")
    customer2, token2 = create_customer(db, "c2@test.com")

    payload = {"topic": "High-Speed Bus Review", "description": "PCIe Gen 4 differential impedance checking."}
    res = client.post("/api/v1/consultations", json=payload, headers={"Authorization": f"Bearer {token1}"})
    consult_id = res.json()["data"]["id"]

    # Customer 2 attempts to fetch customer 1's consultation
    res_idor = client.get(
        f"/api/v1/consultations/{consult_id}",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res_idor.status_code == 404
    assert res_idor.json()["error"]["code"] == "CONSULTATION_NOT_FOUND"



def test_consultation_admin_respond_and_close():
    """Admin provides technical answer and customer closes consultation."""
    db = TestingSessionLocal()
    customer, cust_token = create_customer(db)
    admin, admin_token = create_admin(db)

    # Submit
    res_sub = client.post(
        "/api/v1/consultations",
        json={"topic": "EMI Shielding", "description": "Mitigating switching noise in buck converter."},
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    consult_id = res_sub.json()["data"]["id"]

    # Admin responds
    res_admin = client.post(
        f"/api/v1/admin/consultations/{consult_id}/respond",
        json={
            "admin_response": "Add a snubber circuit (10 ohm + 1nF) across the high-side MOSFET and increase copper pour area.",
            "internal_notes": "Reviewed with senior hardware engineer.",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_admin.status_code == 200
    assert res_admin.json()["data"]["status"] == "responded"
    assert res_admin.json()["data"]["admin_response"] is not None

    # Customer marks resolved (CONSULT-API-004)
    res_resolve = client.post(
        f"/api/v1/consultations/{consult_id}/resolve",
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    assert res_resolve.status_code == 200
    assert res_resolve.json()["data"]["status"] == "completed"

    # Admin marks closed (ADMIN-CONSULT-API-004)
    res_close = client.post(
        f"/api/v1/admin/consultations/{consult_id}/close",
        json={"notes": "Completed and closed by admin review."},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_close.status_code == 200
    assert res_close.json()["data"]["status"] == "closed"


def test_consultation_convert_to_quote():
    """Admin converts technical consultation into formal quotation."""
    db = TestingSessionLocal()
    customer, cust_token = create_customer(db)
    admin, admin_token = create_admin(db)

    res_sub = client.post(
        "/api/v1/consultations",
        json={"topic": "Custom FPGA Accelerator", "description": "Need full architectural specification and verilog development."},
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    consult_id = res_sub.json()["data"]["id"]

    # Convert to quote
    quote_payload = {
        "line_items": [
            {"name": "FPGA Architecture Spec", "amount": "25000.00"},
            {"name": "RTL Synthesis & Verification", "amount": "45000.00"},
        ],
        "shipping_amount": "0.00",
        "estimated_timeline": "4 weeks",
        "valid_until": "2026-12-31T23:59:59Z",
        "terms": "Net 15 terms upon deliverable acceptance",
        "scope_summary": "FPGA Development Engineering Services",
    }
    res_conv = client.post(
        f"/api/v1/admin/consultations/{consult_id}/convert-to-quote",
        json=quote_payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_conv.status_code == 201
    quote_data = res_conv.json()["data"]
    assert quote_data["request_type"] == "consultation"
    assert quote_data["status"] == "draft"

    # Consultation has converted_quote_id
    res_chk = client.get(f"/api/v1/consultations/{consult_id}", headers={"Authorization": f"Bearer {cust_token}"})
    assert res_chk.json()["data"]["converted_quote_id"] == quote_data["id"]


def test_consultation_inactivity_auto_close_task():
    """Celery scheduled task checks for inactivity and closes responded consultations after 14 days."""
    db = TestingSessionLocal()
    customer, _ = create_customer(db)

    # 1. Old responded consultation (> 14 days ago)
    old_req = ConsultationRequest(
        id=uuid.uuid4(),
        user_id=customer.id,
        topic="Legacy Inactive Question",
        description="Older inquiry about microcontroller pinout.",
        status="responded",
        admin_response="Pin 12 is SPI MOSI.",
        created_at=utcnow() - timedelta(days=20),
        updated_at=utcnow() - timedelta(days=15),
    )
    db.add(old_req)

    # 2. Fresh responded consultation (< 14 days ago)
    fresh_req = ConsultationRequest(
        id=uuid.uuid4(),
        user_id=customer.id,
        topic="Active Inquiry",
        description="Recent inquiry.",
        status="responded",
        admin_response="See datasheet.",
        created_at=utcnow() - timedelta(days=2),
        updated_at=utcnow() - timedelta(days=1),
    )
    db.add(fresh_req)
    db.commit()

    # Run auto-close task using settings default
    closed_count = check_inactivity_auto_close()
    assert closed_count == 1

    db.refresh(old_req)
    db.refresh(fresh_req)
    assert old_req.status == "closed"
    assert fresh_req.status == "responded"
    db.close()


def test_consultation_rbac_and_no_invented_roles():
    """Verify Section 2: V1 5-role model enforcement on consultation admin endpoints.
    - SUPER_ADMIN and MANUFACTURING_MANAGER are permitted (200).
    - ORDER_MANAGER, FINANCE_MANAGER, SUPPORT_EXECUTIVE are forbidden (403).
    - Invented role CONSULTATION_MANAGER is forbidden (403).
    """
    db = TestingSessionLocal()

    # 1. Allowed roles
    mfg_mgr, mfg_token = create_admin(db, email="mfg_mgr@venopai.com", role="MANUFACTURING_MANAGER")
    res_mfg = client.get("/api/v1/admin/consultations", headers={"Authorization": f"Bearer {mfg_token}"})
    assert res_mfg.status_code == 200

    super_adm, super_token = create_admin(db, email="super_adm@venopai.com", role="SUPER_ADMIN")
    res_super = client.get("/api/v1/admin/consultations", headers={"Authorization": f"Bearer {super_token}"})
    assert res_super.status_code == 200

    # 2. Canonical non-engineering roles must be rejected with 403
    order_mgr, order_token = create_admin(db, email="order_mgr@venopai.com", role="ORDER_MANAGER")
    res_order = client.get("/api/v1/admin/consultations", headers={"Authorization": f"Bearer {order_token}"})
    assert res_order.status_code == 403

    finance_mgr, fin_token = create_admin(db, email="fin_mgr@venopai.com", role="FINANCE_MANAGER")
    res_fin = client.get("/api/v1/admin/consultations", headers={"Authorization": f"Bearer {fin_token}"})
    assert res_fin.status_code == 403

    supp_exec, supp_token = create_admin(db, email="supp_exec@venopai.com", role="SUPPORT_EXECUTIVE")
    res_supp = client.get("/api/v1/admin/consultations", headers={"Authorization": f"Bearer {supp_token}"})
    assert res_supp.status_code == 403

    # 3. Invented role CONSULTATION_MANAGER must be rejected with 403
    inv_adm, inv_token = create_admin(db, email="inv_admin@venopai.com", role="CONSULTATION_MANAGER")
    res_inv = client.get("/api/v1/admin/consultations", headers={"Authorization": f"Bearer {inv_token}"})
    assert res_inv.status_code == 403
    db.close()

