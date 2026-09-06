import uuid
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
    DesignRequest,
    DesignClarification,
    DesignStatusUpdate,
    ManufacturingRequest,
)
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_design_db():
    db = TestingSessionLocal()
    db.query(DesignStatusUpdate).delete()
    db.query(DesignClarification).delete()
    db.query(ProjectFile).delete()
    db.query(QuoteApproval).delete()
    db.query(QuoteVersion).delete()
    db.query(Quote).delete()
    db.query(ManufacturingRequest).delete()
    db.query(DesignRequest).delete()
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
        full_name="Design Customer",
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
        full_name="Design Admin",
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


def test_design_submission_unverified_customer_blocked():
    """Unverified customer cannot submit design request."""
    db = TestingSessionLocal()
    unverified, token = create_customer(db, is_verified=False)

    payload = {
        "title": "Dual Motor Driver PCB",
        "project_overview": "DRV8871 dual channel H-bridge motor driver.",
        "design_scope": "both",
    }
    res = client.post(
        "/api/v1/design/requests",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "EMAIL_NOT_VERIFIED"


def test_design_submission_and_scopes():
    """Customer submits design request with valid scopes; invalid scope rejected."""
    db = TestingSessionLocal()
    customer, token = create_customer(db)

    # 1. Invalid scope
    res_bad = client.post(
        "/api/v1/design/requests",
        json={
            "title": "Bad Scope Request",
            "project_overview": "Invalid scope test",
            "design_scope": "pcb_and_firmware_combo",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_bad.status_code == 422

    # 2. Valid scope 'both'
    res_good = client.post(
        "/api/v1/design/requests",
        json={
            "title": "Industrial STM32 Gateway PCB",
            "project_overview": "4-layer mixed-signal board with isolated RS485 and Ethernet.",
            "design_scope": "both",
            "additional_notes": "Follow IPC-2221 Class 2 guidelines.",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_good.status_code == 201
    data = res_good.json()["data"]
    design_id = data["id"]
    assert data["design_scope"] == "both"
    assert data["status"] == "submitted"

    # 3. List
    res_list = client.get("/api/v1/design/requests", headers={"Authorization": f"Bearer {token}"})
    assert res_list.status_code == 200
    assert len(res_list.json()["data"]) == 1

    # 4. Detail
    res_det = client.get(f"/api/v1/design/requests/{design_id}", headers={"Authorization": f"Bearer {token}"})
    assert res_det.status_code == 200
    assert res_det.json()["data"]["id"] == design_id


def test_design_idor_isolation():
    """IDOR: Customer B cannot view Customer A's design request."""
    db = TestingSessionLocal()
    c1, token1 = create_customer(db, "c1@example.com")
    c2, token2 = create_customer(db, "c2@example.com")

    res = client.post(
        "/api/v1/design/requests",
        json={"title": "Private Project", "project_overview": "Confidential", "design_scope": "schematic_only"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    design_id = res.json()["data"]["id"]

    res_idor = client.get(f"/api/v1/design/requests/{design_id}", headers={"Authorization": f"Bearer {token2}"})
    assert res_idor.status_code == 404
    assert res_idor.json()["error"]["code"] == "REQUEST_NOT_FOUND"


def test_design_clarification_and_status_progression():
    """Admin changes status, raises clarification, customer answers, admin resolves."""
    db = TestingSessionLocal()
    customer, cust_token = create_customer(db)
    admin, admin_token = create_admin(db)

    # Submit
    res_sub = client.post(
        "/api/v1/design/requests",
        json={"title": "Battery Management PCB", "project_overview": "4S BMS PCB layout", "design_scope": "pcb_layout"},
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    design_id = res_sub.json()["data"]["id"]

    # Admin marks under_review
    res_st = client.post(
        f"/api/v1/admin/design/requests/{design_id}/status",
        json={"status": "under_review", "internal_notes": "Assigning to PCB engineer"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_st.status_code == 200
    assert res_st.json()["data"]["status"] == "under_review"

    # Admin raises clarification
    res_clar = client.post(
        f"/api/v1/admin/design/requests/{design_id}/clarifications",
        json={"question": "What is the maximum continuous discharge current?"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_clar.status_code == 201
    clar_id = res_clar.json()["data"]["id"]

    # Request automatically transitioned to clarification_needed
    res_chk = client.get(f"/api/v1/design/requests/{design_id}", headers={"Authorization": f"Bearer {cust_token}"})
    assert res_chk.json()["data"]["status"] == "clarification_needed"

    # Customer responds
    res_resp = client.post(
        f"/api/v1/design/requests/{design_id}/clarifications/{clar_id}/respond",
        json={"response_text": "Continuous current is 30A with 60A peak for 10 seconds."},
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    assert res_resp.status_code == 200

    # Admin resolves clarification
    res_res = client.post(
        f"/api/v1/admin/design/requests/{design_id}/clarifications/{clar_id}/resolve",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_res.status_code == 200
    assert res_res.json()["data"]["status"] == "resolved"


def test_design_quote_creation_delivery_and_completion():
    """Full lifecycle: requirements confirmed -> quote -> updates -> deliver -> customer completes."""
    db = TestingSessionLocal()
    customer, cust_token = create_customer(db)
    admin, admin_token = create_admin(db)

    res_sub = client.post(
        "/api/v1/design/requests",
        json={"title": "BLE Beacon PCB", "project_overview": "nRF52840 beacon", "design_scope": "both"},
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    design_id = res_sub.json()["data"]["id"]

    # Admin confirms requirements
    client.post(
        f"/api/v1/admin/design/requests/{design_id}/status",
        json={"status": "requirements_confirmed"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    # Admin creates quote
    quote_payload = {
        "request_type": "design",
        "request_id": design_id,
        "line_items": [
            {"name": "Schematic Capture & Component Selection", "amount": "15000.00"},
            {"name": "4-Layer Impedance Controlled PCB Layout", "amount": "20000.00"},
        ],
        "shipping_amount": "0.00",
        "estimated_timeline": "10 business days",
        "valid_until": "2026-12-31T23:59:59Z",
        "terms": "Includes 2 design review revisions.",
        "scope_summary": "nRF52840 Hardware Design Service",
    }
    res_q = client.post("/api/v1/admin/quotes", json=quote_payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert res_q.status_code == 201
    quote_id = res_q.json()["data"]["id"]

    # Send quote
    client.post(f"/api/v1/admin/quotes/{quote_id}/send", headers={"Authorization": f"Bearer {admin_token}"})

    # Customer checks design request status (should be quote_ready)
    res_chk = client.get(f"/api/v1/design/requests/{design_id}", headers={"Authorization": f"Bearer {cust_token}"})
    assert res_chk.json()["data"]["status"] == "quote_ready"

    # Customer approves quote
    res_appr = client.post(f"/api/v1/quotes/{quote_id}/approve", headers={"Authorization": f"Bearer {cust_token}"})
    assert res_appr.status_code == 200

    # Admin posts progress update note
    res_upd = client.post(
        f"/api/v1/admin/design/requests/{design_id}/updates",
        json={"note": "Schematic review complete. Starting PCB placement and routing."},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_upd.status_code == 201

    # Admin marks delivered
    res_deliv = client.post(
        f"/api/v1/admin/design/requests/{design_id}/status",
        json={"status": "delivered"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_deliv.status_code == 200
    assert res_deliv.json()["data"]["status"] == "delivered"

    # Admin marks completed (ADMIN-DESIGN-API-007)
    res_comp = client.post(
        f"/api/v1/admin/design/requests/{design_id}/complete",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_comp.status_code == 200
    assert res_comp.json()["data"]["status"] == "completed"


def test_design_start_manufacturing_convenience_draft():
    """DESIGN-API-006: Pre-populates manufacturing draft payload WITHOUT persisting a record."""
    db = TestingSessionLocal()
    customer, token = create_customer(db)

    res_sub = client.post(
        "/api/v1/design/requests",
        json={
            "title": "Solar MPPT Controller",
            "project_overview": "30A buck converter with MPPT tracking.",
            "design_scope": "both",
            "additional_notes": "Aluminum substrate enclosure.",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    design_id = res_sub.json()["data"]["id"]

    # Call start-manufacturing convenience endpoint (DESIGN-API-006: POST)
    res_draft = client.post(
        f"/api/v1/design/requests/{design_id}/start-manufacturing",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_draft.status_code == 200
    draft_data = res_draft.json()["data"]

    assert "Solar MPPT Controller" in draft_data["title"]
    assert draft_data["source_design_request_id"] == design_id
    assert "prefill" in draft_data

    # INVARIANT CHECK 1: No ManufacturingRequest must have been created in the database!
    mfg_count_initial = db.query(ManufacturingRequest).count()
    assert mfg_count_initial == 0

    # Step 2: Customer reviews and explicitly submits the prefilled draft payload to MFG-API-001
    res_mfg_submit = client.post(
        "/api/v1/manufacturing/requests",
        json={
            "title": draft_data["title"],
            "project_overview": draft_data["project_overview"],
            "prototype_type": draft_data["prototype_type"],
            "quantity": draft_data["quantity"],
            "file_ids": draft_data["reference_file_ids"],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_mfg_submit.status_code == 201
    assert res_mfg_submit.json()["data"]["title"] == draft_data["title"]

    # INVARIANT CHECK 2: Now exactly one ManufacturingRequest exists in the database
    mfg_count_after = db.query(ManufacturingRequest).count()
    assert mfg_count_after == 1
    db.close()


def test_design_cancellation_flow():
    """Customer requests cancellation, admin reviews and decides."""
    db = TestingSessionLocal()
    customer, cust_token = create_customer(db)
    admin, admin_token = create_admin(db)

    res_sub = client.post(
        "/api/v1/design/requests",
        json={"title": "To be cancelled", "project_overview": "Scope changed", "design_scope": "schematic_only"},
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    design_id = res_sub.json()["data"]["id"]

    # Put request into in_progress to trigger post-execution review flow
    d_req = db.query(DesignRequest).filter(DesignRequest.id == uuid.UUID(design_id)).first()
    d_req.status = "in_progress"
    db.commit()

    # Customer requests cancel
    res_c_req = client.post(
        f"/api/v1/design/requests/{design_id}/cancel",
        json={"reason": "Project pivot to off-the-shelf module."},
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    assert res_c_req.status_code == 200
    assert res_c_req.json()["data"]["cancellation_requested"] is True

    # Admin approves cancellation
    res_c_dec = client.post(
        f"/api/v1/admin/design/requests/{design_id}/resolve-cancellation",
        json={
            "decision": "approved",
            "refund_amount": "0.00",
            "notes": "Work had not begun; no charges incurred.",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_c_dec.status_code == 200
    assert res_c_dec.json()["data"]["status"] == "cancelled"
    db.close()


def test_design_rbac_and_no_invented_roles():
    """Verify Section 2: V1 5-role model enforcement on design admin endpoints.
    - SUPER_ADMIN and MANUFACTURING_MANAGER are permitted (200).
    - ORDER_MANAGER, FINANCE_MANAGER, SUPPORT_EXECUTIVE are forbidden (403).
    - Invented role DESIGN_MANAGER is forbidden (403).
    """
    db = TestingSessionLocal()

    # 1. Allowed roles
    mfg_mgr, mfg_token = create_admin(db, email="mfg_mgr_d@venopai.com", role="MANUFACTURING_MANAGER")
    res_mfg = client.get("/api/v1/admin/design/requests", headers={"Authorization": f"Bearer {mfg_token}"})
    assert res_mfg.status_code == 200

    super_adm, super_token = create_admin(db, email="super_adm_d@venopai.com", role="SUPER_ADMIN")
    res_super = client.get("/api/v1/admin/design/requests", headers={"Authorization": f"Bearer {super_token}"})
    assert res_super.status_code == 200

    # 2. Canonical non-engineering roles must be rejected with 403
    order_mgr, order_token = create_admin(db, email="order_mgr_d@venopai.com", role="ORDER_MANAGER")
    res_order = client.get("/api/v1/admin/design/requests", headers={"Authorization": f"Bearer {order_token}"})
    assert res_order.status_code == 403

    finance_mgr, fin_token = create_admin(db, email="fin_mgr_d@venopai.com", role="FINANCE_MANAGER")
    res_fin = client.get("/api/v1/admin/design/requests", headers={"Authorization": f"Bearer {fin_token}"})
    assert res_fin.status_code == 403

    supp_exec, supp_token = create_admin(db, email="supp_exec_d@venopai.com", role="SUPPORT_EXECUTIVE")
    res_supp = client.get("/api/v1/admin/design/requests", headers={"Authorization": f"Bearer {supp_token}"})
    assert res_supp.status_code == 403

    # 3. Invented role DESIGN_MANAGER must be rejected with 403
    inv_adm, inv_token = create_admin(db, email="inv_admin_d@venopai.com", role="DESIGN_MANAGER")
    res_inv = client.get("/api/v1/admin/design/requests", headers={"Authorization": f"Bearer {inv_token}"})
    assert res_inv.status_code == 403
    db.close()

