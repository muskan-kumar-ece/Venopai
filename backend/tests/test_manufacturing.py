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
    ManufacturingRequest,
    ManufacturingClarification,
    ManufacturingStatusUpdate,
)
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_mfg_db():
    db = TestingSessionLocal()
    db.query(ManufacturingStatusUpdate).delete()
    db.query(ManufacturingClarification).delete()
    db.query(ProjectFile).delete()
    db.query(QuoteApproval).delete()
    db.query(QuoteVersion).delete()
    db.query(Quote).delete()
    db.query(ManufacturingRequest).delete()
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
        full_name="Test Customer",
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


def test_mfg_submission_unverified_customer_blocked():
    db = TestingSessionLocal()
    unverified_user, token = create_customer(db, is_verified=False)

    payload = {
        "title": "Smart Collar PCB",
        "project_overview": "Pet tracking collar board",
        "prototype_type": "pcb_assembly",
        "quantity": 5,
    }
    res = client.post(
        "/api/v1/manufacturing/requests",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "EMAIL_NOT_VERIFIED"


def test_mfg_submission_success_and_duplicate_prevention():
    db = TestingSessionLocal()
    user, token = create_customer(db, is_verified=True)

    payload = {
        "title": "Drone ESC Board",
        "project_overview": "40A 4-in-1 ESC board with BLHeli_32",
        "prototype_type": "pcb_assembly",
        "quantity": 10,
        "technical_requirements": "FR4 4-layer 2oz copper",
        "materials": "FR4, Lead-Free HASL",
    }

    # First submission -> 201 Created
    res1 = client.post(
        "/api/v1/manufacturing/requests",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res1.status_code == 201
    data1 = res1.json()["data"]
    assert data1["title"] == "Drone ESC Board"
    assert data1["status"] == "submitted"
    assert data1["quantity"] == 10

    # Immediate identical duplicate submission -> 409 DUPLICATE_SUBMISSION
    res2 = client.post(
        "/api/v1/manufacturing/requests",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res2.status_code == 409
    assert res2.json()["error"]["code"] == "DUPLICATE_SUBMISSION"


def test_mfg_missing_required_fields_rejected():
    db = TestingSessionLocal()
    user, token = create_customer(db, is_verified=True)

    # Missing title
    res1 = client.post(
        "/api/v1/manufacturing/requests",
        json={"project_overview": "test", "prototype_type": "3d_printing", "quantity": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res1.status_code == 422  # Pydantic schema validation

    # Quantity <= 0
    res2 = client.post(
        "/api/v1/manufacturing/requests",
        json={"title": "Test", "project_overview": "test", "prototype_type": "3d_printing", "quantity": 0},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res2.status_code == 422


def test_mfg_customer_idor_isolation():
    db = TestingSessionLocal()
    user1, token1 = create_customer(db, "u1@example.com")
    user2, token2 = create_customer(db, "u2@example.com")

    # User 1 creates request
    res1 = client.post(
        "/api/v1/manufacturing/requests",
        json={"title": "Secret Drone", "project_overview": "Confidential", "prototype_type": "cnc_machining", "quantity": 1},
        headers={"Authorization": f"Bearer {token1}"},
    )
    req_id = res1.json()["data"]["id"]

    # User 2 attempts to fetch User 1's request -> 404 (SEC-009)
    res2 = client.get(
        f"/api/v1/manufacturing/requests/{req_id}",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res2.status_code == 404
    assert res2.json()["error"]["code"] == "REQUEST_NOT_FOUND"

    # User 2 attempts to cancel User 1's request -> 404
    res3 = client.post(
        f"/api/v1/manufacturing/requests/{req_id}/cancel",
        json={"reason": "Unauthorized cancel"},
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res3.status_code == 404


def test_mfg_structured_clarification_flow():
    db = TestingSessionLocal()
    user, user_token = create_customer(db, "cust@example.com")
    admin, admin_token = create_admin(db, "admin@venopai.com")

    # 1. Customer creates request
    res = client.post(
        "/api/v1/manufacturing/requests",
        json={"title": "Custom Keyboard Case", "project_overview": "Milled aluminum case", "prototype_type": "cnc_machining", "quantity": 2},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    req_id = res.json()["data"]["id"]

    # 2. Admin raises clarification (ADMIN-MFG-API-004)
    clar_res = client.post(
        f"/api/v1/admin/manufacturing/requests/{req_id}/clarifications",
        json={"question": "What anodizing finish color and bead-blast grit do you require?"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert clar_res.status_code == 201
    clar_id = clar_res.json()["data"]["id"]

    # Verify request status transitioned to clarification_needed
    req_detail = client.get(f"/api/v1/manufacturing/requests/{req_id}", headers={"Authorization": f"Bearer {user_token}"})
    assert req_detail.json()["data"]["status"] == "clarification_needed"

    # 3. Customer lists clarifications (MFG-API-005)
    list_clars = client.get(
        f"/api/v1/manufacturing/requests/{req_id}/clarifications",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert list_clars.status_code == 200
    assert len(list_clars.json()["data"]) == 1
    assert list_clars.json()["data"][0]["id"] == clar_id

    # 4. Customer responds (MFG-API-006)
    resp_res = client.post(
        f"/api/v1/manufacturing/requests/{req_id}/clarifications/{clar_id}/respond",
        json={"response_text": "Matte black anodize with #150 bead-blast finish."},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp_res.status_code == 200

    # Verify request status returned to under_review
    req_detail2 = client.get(f"/api/v1/manufacturing/requests/{req_id}", headers={"Authorization": f"Bearer {user_token}"})
    assert req_detail2.json()["data"]["status"] == "under_review"


def test_mfg_cancellation_pre_and_post_execution():
    db = TestingSessionLocal()
    user, user_token = create_customer(db, "cust2@example.com")
    admin, admin_token = create_admin(db, "admin2@venopai.com")

    # Case A: Pre-execution cancellation (under_review) -> immediate cancel
    res_a = client.post(
        "/api/v1/manufacturing/requests",
        json={"title": "Test Pre-Cancel", "project_overview": "Overview", "prototype_type": "3d_printing", "quantity": 1},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    req_a_id = res_a.json()["data"]["id"]

    cancel_a = client.post(
        f"/api/v1/manufacturing/requests/{req_a_id}/cancel",
        json={"reason": "Project budget cancelled"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert cancel_a.status_code == 200
    assert cancel_a.json()["data"]["status"] == "cancelled"

    # Case B: Post-execution cancellation (in_progress) -> flagged for review
    res_b = client.post(
        "/api/v1/manufacturing/requests",
        json={"title": "Test Post-Cancel", "project_overview": "Overview", "prototype_type": "3d_printing", "quantity": 1},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    req_b_id = res_b.json()["data"]["id"]

    # Transition to in_progress directly in DB
    mfg_b = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == uuid.UUID(req_b_id)).first()
    mfg_b.status = "in_progress"
    db.commit()

    cancel_b = client.post(
        f"/api/v1/manufacturing/requests/{req_b_id}/cancel",
        json={"reason": "Need to abort production run"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert cancel_b.status_code == 200
    assert cancel_b.json()["data"]["status"] == "in_progress"  # Still in_progress!
    assert cancel_b.json()["data"]["cancellation_requested"] is True

    # Admin reviews cancellation queue (ADMIN-MFG-API-008)
    review_queue = client.get(
        "/api/v1/admin/manufacturing/cancellation-review-queue",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert review_queue.status_code == 200
    assert any(item["id"] == req_b_id for item in review_queue.json()["data"])

    # Admin resolves cancellation with refund (ADMIN-MFG-API-009)
    resolve_res = client.post(
        f"/api/v1/admin/manufacturing/requests/{req_b_id}/resolve-cancellation",
        json={
            "decision": "approved",
            "refund_amount": "250.00",
            "notes": "Partial refund approved minus materials expended",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resolve_res.status_code == 200
    assert resolve_res.json()["data"]["status"] == "cancelled"
    assert resolve_res.json()["data"]["cancellation_decision"] == "approved"
    assert resolve_res.json()["data"]["cancellation_refund_paise"] == 25000


def test_mfg_admin_operational_queue_and_status_updates():
    db = TestingSessionLocal()
    user, user_token = create_customer(db, "cust3@example.com")
    admin, admin_token = create_admin(db, "admin3@venopai.com")

    # Create request
    res = client.post(
        "/api/v1/manufacturing/requests",
        json={"title": "Telemetry Module", "project_overview": "Lora board", "prototype_type": "pcb_assembly", "quantity": 5},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    req_id = res.json()["data"]["id"]

    # 1. Admin checks operational queue (ADMIN-MFG-API-001)
    queue_res = client.get(
        "/api/v1/admin/manufacturing/requests?status=submitted",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert queue_res.status_code == 200
    assert queue_res.json()["pagination"]["total"] >= 1

    # 2. Admin confirms requirements (ADMIN-MFG-API-003)
    # First transition to under_review
    mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == uuid.UUID(req_id)).first()
    mfg.status = "under_review"
    db.commit()

    confirm_res = client.post(
        f"/api/v1/admin/manufacturing/requests/{req_id}/confirm-requirements",
        json={"notes": "All schematic rules and PCB stackups verified"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert confirm_res.status_code == 200
    assert confirm_res.json()["data"]["status"] == "requirements_confirmed"

    # 3. Admin posts execution status update (ADMIN-MFG-API-005)
    note_res = client.post(
        f"/api/v1/admin/manufacturing/requests/{req_id}/status-update",
        json={"note": "SMT pick and place completed, moving to reflow oven."},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert note_res.status_code == 201

    # 4. Customer views timeline history (MFG-API-007)
    history_res = client.get(
        f"/api/v1/manufacturing/requests/{req_id}/history",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert history_res.status_code == 200
    events = history_res.json()["data"]
    assert len(events) >= 2
    assert any("SMT pick and place" in e.get("description", "") for e in events)


def test_mfg_history_idor_isolation():
    """MFG-API-007 & SEC-009: History endpoint returns 404 for non-owner."""
    db = TestingSessionLocal()
    user1, token1 = create_customer(db, "owner@example.com")
    user2, token2 = create_customer(db, "intruder@example.com")

    res = client.post(
        "/api/v1/manufacturing/requests",
        json={"title": "Private Project", "project_overview": "Confidential hardware", "prototype_type": "cnc_machining", "quantity": 1},
        headers={"Authorization": f"Bearer {token1}"},
    )
    req_id = res.json()["data"]["id"]

    # Owner can access history -> 200
    hist_owner = client.get(
        f"/api/v1/manufacturing/requests/{req_id}/history",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert hist_owner.status_code == 200

    # Non-owner receives 404
    hist_intruder = client.get(
        f"/api/v1/manufacturing/requests/{req_id}/history",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert hist_intruder.status_code == 404
    assert hist_intruder.json()["error"]["code"] == "REQUEST_NOT_FOUND"


def test_mfg_canonical_11_states_enforcement():
    """CORRECTION 2: Verify strictly 11 canonical states and reject obsolete states."""
    db = TestingSessionLocal()
    user, user_token = create_customer(db, "states_cust@example.com")
    admin, admin_token = create_admin(db, "states_admin@venopai.com")

    # 11 Canonical States:
    canonical_states = {
        "submitted",
        "under_review",
        "clarification_needed",
        "requirements_confirmed",
        "quote_ready",
        "payment_pending",
        "in_progress",
        "completed_execution",
        "delivered",
        "completed",
        "cancelled",
    }
    assert len(canonical_states) == 11

    # Obsolete states must NOT be in canonical set
    assert "quote_issued" not in canonical_states
    assert "quote_accepted" not in canonical_states

    # Create request -> starts in submitted
    res = client.post(
        "/api/v1/manufacturing/requests",
        json={"title": "States Test", "project_overview": "Overview", "prototype_type": "3d_printing", "quantity": 1},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    req_id = res.json()["data"]["id"]
    assert res.json()["data"]["status"] == "submitted"

    # Admin queries operational queue for obsolete states -> yields 0 items
    q_issued = client.get(
        "/api/v1/admin/manufacturing/requests?status=quote_issued",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert q_issued.status_code == 200
    assert q_issued.json()["pagination"]["total"] == 0

    q_accepted = client.get(
        "/api/v1/admin/manufacturing/requests?status=quote_accepted",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert q_accepted.status_code == 200
    assert q_accepted.json()["pagination"]["total"] == 0

