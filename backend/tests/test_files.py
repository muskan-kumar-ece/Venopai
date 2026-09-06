import io
import uuid
import json
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User, AuditEvent
from app.models.project import Project, ProjectFile, ManufacturingRequest
from app.core.security import get_password_hash, create_access_token
from app.workers.tasks.files import scan_file_malware
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_files_db():
    db = TestingSessionLocal()
    db.query(ProjectFile).delete()
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
        full_name="Verified Customer",
        is_active=True,
        status="verified" if is_verified else "registered",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(subject=str(user.id), role="customer", audience="customer")
    return user, token


def create_admin(db, email="mfg_admin@venopai.com", role="MANUFACTURING_MANAGER"):
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


def test_file_upload_starts_in_pending_scan():
    """CORRECTION 1: upload must initialize scan_status as pending_scan."""
    db = TestingSessionLocal()
    user, token = create_customer(db)

    file_content = b"%PDF-1.4 dummy pdf content"
    files = {"file": ("schematic.pdf", io.BytesIO(file_content), "application/pdf")}
    data = {"association_type": "manufacturing"}

    response = client.post(
        "/api/v1/files",
        files=files,
        data=data,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    resp_data = response.json()["data"]
    assert resp_data["filename"] == "schematic.pdf"
    assert resp_data["content_type"] == "application/pdf"
    assert resp_data["scan_status"] == "pending_scan"
    assert resp_data["source"] == "customer_upload"


def test_file_download_while_pending_is_blocked():
    """CORRECTION 1: download when pending_scan returns 409."""
    db = TestingSessionLocal()
    user, token = create_customer(db)

    files = {"file": ("schematic.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")}
    res = client.post(
        "/api/v1/files",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )
    file_id = res.json()["data"]["id"]

    # In DB, verify it is pending_scan
    pfile = db.query(ProjectFile).filter(ProjectFile.id == uuid.UUID(file_id)).first()
    pfile.scan_status = "pending_scan"
    db.commit()

    dl_res = client.get(
        f"/api/v1/files/{file_id}/download",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert dl_res.status_code == 409
    assert dl_res.json()["error"]["code"] == "FILE_NOT_YET_AVAILABLE"


def test_celery_scan_transitions_to_clean_and_allows_download():
    """CORRECTION 1: Celery scan task transitions pending_scan -> clean and allows signed URL."""
    db = TestingSessionLocal()
    user, token = create_customer(db)

    files = {"file": ("schematic.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")}
    res = client.post(
        "/api/v1/files",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )
    file_id = res.json()["data"]["id"]

    # Run Celery malware scan task
    status = scan_file_malware(file_id)
    assert status == "clean"

    # Now download should succeed with signed Cloudinary URL
    dl_res = client.get(
        f"/api/v1/files/{file_id}/download",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert dl_res.status_code == 200
    assert "download_url" in dl_res.json()["data"]
    assert dl_res.json()["data"]["expires_in"] == 300


def test_file_scan_flagged_and_failed_blocked():
    """CORRECTION 1: Flagged and failed files cannot be downloaded (410)."""
    db = TestingSessionLocal()
    user, token = create_customer(db)

    # 1. Flagged file (e.g. infected)
    files = {"file": ("eicar_test_infected.pdf", io.BytesIO(b"EICAR test string"), "application/pdf")}
    res = client.post(
        "/api/v1/files",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )
    file_id = res.json()["data"]["id"]
    status = scan_file_malware(file_id)
    assert status == "flagged"

    dl_flagged = client.get(
        f"/api/v1/files/{file_id}/download",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert dl_flagged.status_code == 410
    assert dl_flagged.json()["error"]["code"] == "FILE_FLAGGED"

    # 2. Failed scan file
    files2 = {"file": ("corrupt_fail.step", io.BytesIO(b"corrupt header"), "application/octet-stream")}
    res2 = client.post(
        "/api/v1/files",
        files=files2,
        headers={"Authorization": f"Bearer {token}"},
    )
    file_id2 = res2.json()["data"]["id"]
    status2 = scan_file_malware(file_id2)
    assert status2 == "failed"

    dl_failed = client.get(
        f"/api/v1/files/{file_id2}/download",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert dl_failed.status_code == 410
    assert dl_failed.json()["error"]["code"] == "FILE_SCAN_FAILED"


def test_file_unauthorized_customer_receives_404():
    """CORRECTION 1 & SEC-009: Non-owner receives 404 before any signed URL generation."""
    db = TestingSessionLocal()
    user1, token1 = create_customer(db, "user1@example.com")
    user2, token2 = create_customer(db, "user2@example.com")

    files = {"file": ("drawing.step", io.BytesIO(b"STEP-file-content"), "application/octet-stream")}
    res = client.post(
        "/api/v1/files",
        files=files,
        data={"association_type": "manufacturing"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    file_id = res.json()["data"]["id"]
    scan_file_malware(file_id)

    # User 2 receives 404 (IDOR protection)
    res2 = client.get(
        f"/api/v1/files/{file_id}/download",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res2.status_code == 404
    assert res2.json()["error"]["code"] == "FILE_NOT_FOUND"


def test_admin_file_rbac_scoping():
    """CORRECTION 9: MANUFACTURING_MANAGER permitted; ORDER_MANAGER/SUPPORT_EXECUTIVE rejected with 403."""
    db = TestingSessionLocal()
    mfg_admin, mfg_token = create_admin(db, "mfg@venopai.com", role="MANUFACTURING_MANAGER")
    order_admin, order_token = create_admin(db, "order@venopai.com", role="ORDER_MANAGER")
    support_admin, support_token = create_admin(db, "support@venopai.com", role="SUPPORT_EXECUTIVE")
    user, user_token = create_customer(db, "cust@example.com")

    req_id = str(uuid.uuid4())
    # 1. MANUFACTURING_MANAGER uploads deliverable -> 201
    files = {"file": ("pcb_deliverable.zip", io.BytesIO(b"PK-gerber"), "application/zip")}
    res_mfg = client.post(
        f"/api/v1/admin/requests/manufacturing/{req_id}/deliverables",
        files=files,
        headers={"Authorization": f"Bearer {mfg_token}"},
    )
    assert res_mfg.status_code == 201
    file_id = res_mfg.json()["data"]["id"]

    # 2. MANUFACTURING_MANAGER can list files -> 200
    res_list = client.get(
        f"/api/v1/admin/requests/manufacturing/{req_id}/files",
        headers={"Authorization": f"Bearer {mfg_token}"},
    )
    assert res_list.status_code == 200

    # 3. ORDER_MANAGER attempts to list manufacturing files -> 403
    res_order = client.get(
        f"/api/v1/admin/requests/manufacturing/{req_id}/files",
        headers={"Authorization": f"Bearer {order_token}"},
    )
    assert res_order.status_code == 403

    # 4. SUPPORT_EXECUTIVE attempts to list manufacturing files -> 403
    res_supp = client.get(
        f"/api/v1/admin/requests/manufacturing/{req_id}/files",
        headers={"Authorization": f"Bearer {support_token}"},
    )
    assert res_supp.status_code == 403

    # 5. ORDER_MANAGER attempts to download manufacturing file -> 403
    res_dl_order = client.get(
        f"/api/v1/admin/files/{file_id}/download",
        headers={"Authorization": f"Bearer {order_token}"},
    )
    assert res_dl_order.status_code == 403


def test_file_upload_empty_and_unsupported_rejected():
    db = TestingSessionLocal()
    user, token = create_customer(db)

    # Empty file -> 400
    files = {"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")}
    res = client.post("/api/v1/files", files=files, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "FILE_EMPTY"

    # Unsupported exe -> 400
    files_exe = {"file": ("virus.exe", io.BytesIO(b"MZ binary"), "application/x-msdownload")}
    res_exe = client.post("/api/v1/files", files=files_exe, headers={"Authorization": f"Bearer {token}"})
    assert res_exe.status_code == 400
    assert res_exe.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"
