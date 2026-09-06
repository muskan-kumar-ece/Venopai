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
    SoftwareRequest,
    SoftwareClarification,
    SoftwareStatusUpdate,
)
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_sw_db():
    db = TestingSessionLocal()
    db.query(SoftwareStatusUpdate).delete()
    db.query(SoftwareClarification).delete()
    db.query(ProjectFile).delete()
    db.query(QuoteApproval).delete()
    db.query(QuoteVersion).delete()
    db.query(Quote).delete()
    db.query(SoftwareRequest).delete()
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
        full_name="Software Customer",
        is_active=True,
        status="verified" if is_verified else "registered",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(subject=str(user.id), role="customer", audience="customer")
    return user, token


def create_admin(db, email="admin@venopai.com", role="SOFTWARE_MANAGER"):
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=get_password_hash("AdminPass123!"),
        full_name="Software Admin",
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


def test_software_submission_unverified_customer_blocked():
    """Unverified customer cannot submit software request."""
    db = TestingSessionLocal()
    unverified, token = create_customer(db, is_verified=False)

    payload = {
        "title": "ESP32 OTA Firmware",
        "project_description": "Firmware with dual partition rollback and HTTPS OTA update.",
        "requirements": "FreeRTOS, mbedTLS, MQTT.",
        "platform_technology": "ESP-IDF / C++",
    }
    res = client.post(
        "/api/v1/software/requests",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "EMAIL_NOT_VERIFIED"


def test_software_submission_and_detail():
    """Verified customer submits software/firmware request and retrieves detail."""
    db = TestingSessionLocal()
    customer, token = create_customer(db)

    payload = {
        "title": "STM32 Bootloader & Crypto Driver",
        "project_description": "Secure bootloader for STM32H7 with ECDSA signature verification.",
        "requirements": "ARM Cortex-M7 assembly/C, flash write protection, hardware crypto engine integration.",
        "platform_technology": "Bare metal STM32Cube / ARM GCC",
        "additional_notes": "Deliverables must include flashing guide and unit test vectors.",
    }
    res = client.post(
        "/api/v1/software/requests",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201
    data = res.json()["data"]
    sw_id = data["id"]
    assert data["title"] == payload["title"]
    assert data["platform_technology"] == payload["platform_technology"]
    assert data["status"] == "submitted"

    # List requests
    res_list = client.get("/api/v1/software/requests", headers={"Authorization": f"Bearer {token}"})
    assert res_list.status_code == 200
    assert len(res_list.json()["data"]) == 1

    # Get detail
    res_det = client.get(f"/api/v1/software/requests/{sw_id}", headers={"Authorization": f"Bearer {token}"})
    assert res_det.status_code == 200
    assert res_det.json()["data"]["id"] == sw_id


def test_software_idor_isolation():
    """IDOR protection: Customer B cannot fetch Customer A's software request."""
    db = TestingSessionLocal()
    c1, token1 = create_customer(db, "c1@example.com")
    c2, token2 = create_customer(db, "c2@example.com")

    res = client.post(
        "/api/v1/software/requests",
        json={
            "title": "Proprietary Algorithm Implementation",
            "project_description": "Confidential DSP pipeline.",
            "requirements": "Fixed-point FFT.",
        },
        headers={"Authorization": f"Bearer {token1}"},
    )
    sw_id = res.json()["data"]["id"]

    res_idor = client.get(f"/api/v1/software/requests/{sw_id}", headers={"Authorization": f"Bearer {token2}"})
    assert res_idor.status_code == 404
    assert res_idor.json()["error"]["code"] == "REQUEST_NOT_FOUND"


def test_software_clarification_and_status_flow():
    """Admin transitions status, asks clarification, customer answers, admin resolves."""
    db = TestingSessionLocal()
    customer, cust_token = create_customer(db)
    admin, admin_token = create_admin(db)

    # Submit
    res_sub = client.post(
        "/api/v1/software/requests",
        json={
            "title": "Nordic BLE Mesh Node Firmware",
            "project_description": "Bluetooth mesh lighting controller.",
            "requirements": "Zephyr RTOS based Bluetooth mesh model implementation.",
            "platform_technology": "nRF Connect SDK / Zephyr RTOS",
        },
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    sw_id = res_sub.json()["data"]["id"]

    # Admin sets under_review
    res_st = client.post(
        f"/api/v1/admin/software/requests/{sw_id}/status",
        json={"status": "under_review", "internal_notes": "Assigned to embedded systems lead"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_st.status_code == 200
    assert res_st.json()["data"]["status"] == "under_review"

    # Admin asks clarification
    res_clar = client.post(
        f"/api/v1/admin/software/requests/{sw_id}/clarifications",
        json={"question": "Are you using vendor mesh models or standard SIG Generic OnOff models?"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_clar.status_code == 201
    clar_id = res_clar.json()["data"]["id"]

    # Status automatically transitioned to clarification_needed
    res_chk = client.get(f"/api/v1/software/requests/{sw_id}", headers={"Authorization": f"Bearer {cust_token}"})
    assert res_chk.json()["data"]["status"] == "clarification_needed"

    # Customer responds
    res_resp = client.post(
        f"/api/v1/software/requests/{sw_id}/clarifications/{clar_id}/respond",
        json={"response_text": "Standard SIG Generic OnOff and Level models with provisioner support."},
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    assert res_resp.status_code == 200

    # Admin resolves clarification
    res_res = client.post(
        f"/api/v1/admin/software/requests/{sw_id}/clarifications/{clar_id}/resolve",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_res.status_code == 200
    assert res_res.json()["data"]["status"] == "resolved"


def test_software_quote_execution_and_completion():
    """Full lifecycle: quote -> execution note -> deliver -> complete."""
    db = TestingSessionLocal()
    customer, cust_token = create_customer(db)
    admin, admin_token = create_admin(db)

    res_sub = client.post(
        "/api/v1/software/requests",
        json={
            "title": "CAN Bus Telematics Firmware",
            "project_description": "J1939 parser and LTE Cat-M1 gateway logger.",
            "requirements": "ISO 11898 CAN bus transceiver integration and queueing.",
        },
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    sw_id = res_sub.json()["data"]["id"]

    # Admin confirms requirements
    client.post(
        f"/api/v1/admin/software/requests/{sw_id}/status",
        json={"status": "requirements_confirmed"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    # Admin creates quote
    quote_payload = {
        "request_type": "software",
        "request_id": sw_id,
        "line_items": [
            {"name": "CAN J1939 Protocol Stack Implementation", "amount": "30000.00"},
            {"name": "Cellular MQTT Telemetry Uplink", "amount": "20000.00"},
        ],
        "shipping_amount": "0.00",
        "estimated_timeline": "3 weeks",
        "valid_until": "2026-12-31T23:59:59Z",
        "terms": "Source code repository transfer on final sign-off.",
        "scope_summary": "Telematics Firmware Engineering",
    }
    res_q = client.post("/api/v1/admin/quotes", json=quote_payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert res_q.status_code == 201
    quote_id = res_q.json()["data"]["id"]

    # Send quote
    client.post(f"/api/v1/admin/quotes/{quote_id}/send", headers={"Authorization": f"Bearer {admin_token}"})

    # Status moved to quote_ready
    res_chk = client.get(f"/api/v1/software/requests/{sw_id}", headers={"Authorization": f"Bearer {cust_token}"})
    assert res_chk.json()["data"]["status"] == "quote_ready"

    # Customer approves
    res_appr = client.post(f"/api/v1/quotes/{quote_id}/approve", headers={"Authorization": f"Bearer {cust_token}"})
    assert res_appr.status_code == 200

    # Admin posts progress update
    res_upd = client.post(
        f"/api/v1/admin/software/requests/{sw_id}/updates",
        json={"note": "CAN message parsing validated on Vector CANoe hardware simulator."},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_upd.status_code == 201

    # Admin marks delivered
    res_deliv = client.post(
        f"/api/v1/admin/software/requests/{sw_id}/status",
        json={"status": "delivered"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_deliv.status_code == 200
    assert res_deliv.json()["data"]["status"] == "delivered"

    # Customer marks completed
    res_comp = client.post(
        f"/api/v1/software/requests/{sw_id}/complete",
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    assert res_comp.status_code == 200
    assert res_comp.json()["data"]["status"] == "completed"


def test_software_cancellation_flow():
    """Customer requests cancellation, admin reviews and approves."""
    db = TestingSessionLocal()
    customer, cust_token = create_customer(db)
    admin, admin_token = create_admin(db)

    res_sub = client.post(
        "/api/v1/software/requests",
        json={"title": "Cancelled Firmware", "project_description": "Cancel test", "requirements": "Cancel test firmware requirements"},
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    assert res_sub.status_code == 201
    sw_id = res_sub.json()["data"]["id"]

    # Transition to in_progress to test post-execution cancellation review
    sw_req = db.query(SoftwareRequest).filter(SoftwareRequest.id == uuid.UUID(sw_id)).first()
    sw_req.status = "in_progress"
    db.commit()

    # Customer requests cancellation
    res_c_req = client.post(
        f"/api/v1/software/requests/{sw_id}/cancel",
        json={"reason": "Hardware revision superseded requirement."},
        headers={"Authorization": f"Bearer {cust_token}"},
    )
    assert res_c_req.status_code == 200
    assert res_c_req.json()["data"]["cancellation_requested"] is True

    # Admin approves cancellation
    res_c_dec = client.post(
        f"/api/v1/admin/software/requests/{sw_id}/resolve-cancellation",
        json={"decision": "approved", "refund_amount": "0.00", "notes": "Approved without penalty."},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_c_dec.status_code == 200
    assert res_c_dec.json()["data"]["status"] == "cancelled"
