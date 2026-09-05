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


def test_file_upload_success():
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
    assert resp_data["scan_status"] == "clean"
    assert resp_data["source"] == "customer_upload"


def test_file_upload_empty_rejected():
    db = TestingSessionLocal()
    user, token = create_customer(db)

    files = {"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")}
    response = client.post(
        "/api/v1/files",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "FILE_EMPTY"


def test_file_upload_unsupported_type_rejected():
    db = TestingSessionLocal()
    user, token = create_customer(db)

    files = {"file": ("script.exe", io.BytesIO(b"MZ malicious binary"), "application/x-msdownload")}
    response = client.post(
        "/api/v1/files",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"


def test_file_metadata_and_idor_protection():
    db = TestingSessionLocal()
    user1, token1 = create_customer(db, "user1@example.com")
    user2, token2 = create_customer(db, "user2@example.com")

    # User 1 uploads a file
    files = {"file": ("drawing.step", io.BytesIO(b"STEP-file-content"), "application/octet-stream")}
    res = client.post(
        "/api/v1/files",
        files=files,
        data={"association_type": "manufacturing"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    file_id = res.json()["data"]["id"]

    # User 1 can view metadata
    res1 = client.get(
        f"/api/v1/files/{file_id}",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert res1.status_code == 200
    assert res1.json()["data"]["id"] == file_id

    # User 2 receives 404 (IDOR protection per SEC-009)
    res2 = client.get(
        f"/api/v1/files/{file_id}",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res2.status_code == 404
    assert res2.json()["error"]["code"] == "FILE_NOT_FOUND"


def test_file_download_signed_url_and_scan_status():
    db = TestingSessionLocal()
    user1, token1 = create_customer(db, "user1@example.com")

    files = {"file": ("specs.pdf", io.BytesIO(b"%PDF-1.4 sample content"), "application/pdf")}
    res = client.post(
        "/api/v1/files",
        files=files,
        headers={"Authorization": f"Bearer {token1}"},
    )
    file_id = res.json()["data"]["id"]

    # Download when clean -> 200
    dl_res = client.get(
        f"/api/v1/files/{file_id}/download",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert dl_res.status_code == 200
    assert "download_url" in dl_res.json()["data"]
    assert dl_res.json()["data"]["expires_in"] == 300

    # If scan_status == pending_scan -> 409
    pfile = db.query(ProjectFile).filter(ProjectFile.id == uuid.UUID(file_id)).first()
    pfile.scan_status = "pending_scan"
    db.commit()

    dl_pending = client.get(
        f"/api/v1/files/{file_id}/download",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert dl_pending.status_code == 409
    assert dl_pending.json()["error"]["code"] == "FILE_NOT_YET_AVAILABLE"

    # If scan_status == flagged -> 410
    pfile.scan_status = "flagged"
    db.commit()

    dl_flagged = client.get(
        f"/api/v1/files/{file_id}/download",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert dl_flagged.status_code == 410
    assert dl_flagged.json()["error"]["code"] == "FILE_FLAGGED"


def test_file_delete_customer_upload():
    db = TestingSessionLocal()
    user1, token1 = create_customer(db, "user1@example.com")

    files = {"file": ("delete_me.pdf", io.BytesIO(b"%PDF-1.4 delete test"), "application/pdf")}
    res = client.post(
        "/api/v1/files",
        files=files,
        headers={"Authorization": f"Bearer {token1}"},
    )
    file_id = res.json()["data"]["id"]

    del_res = client.delete(
        f"/api/v1/files/{file_id}",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert del_res.status_code == 200

    # Verify gone
    meta_res = client.get(
        f"/api/v1/files/{file_id}",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert meta_res.status_code == 404


def test_admin_deliverable_upload_and_permissions():
    db = TestingSessionLocal()
    mfg_admin, admin_token = create_admin(db, "admin@venopai.com", role="MANUFACTURING_MANAGER")
    user, user_token = create_customer(db, "cust@example.com")

    req_id = str(uuid.uuid4())
    # Admin uploads deliverable
    files = {"file": ("final_gerber.zip", io.BytesIO(b"PK-gerber-files"), "application/zip")}
    res = client.post(
        f"/api/v1/admin/requests/manufacturing/{req_id}/deliverables",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 201
    file_id = res.json()["data"]["id"]
    assert res.json()["data"]["source"] == "team_deliverable"

    # Admin lists request files
    list_res = client.get(
        f"/api/v1/admin/requests/manufacturing/{req_id}/files",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert list_res.status_code == 200
    assert len(list_res.json()["data"]) == 1

    # Customer attempts to delete deliverable -> 403 or 404 (IDOR / not customer file)
    del_res = client.delete(
        f"/api/v1/files/{file_id}",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert del_res.status_code in (403, 404)
