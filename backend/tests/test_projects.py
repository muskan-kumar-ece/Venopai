import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User, AuditEvent
from app.models.project import Project, ProjectFile, ManufacturingRequest
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_projects_db():
    db = TestingSessionLocal()
    db.query(ProjectFile).delete()
    db.query(ManufacturingRequest).delete()
    db.query(Project).delete()
    db.query(AuditEvent).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def create_customer(db, email="cust@example.com"):
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=get_password_hash("Pass123!"),
        full_name="Cust User",
        is_active=True,
        status="verified",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(subject=str(user.id), role="customer", audience="customer")
    return user, token


def test_project_crud_and_name_only_creation():
    db = TestingSessionLocal()
    user, token = create_customer(db)

    # 1. Create project (PROJECT-API-002: name only)
    res = client.post(
        "/api/v1/projects",
        json={"name": "IoT Gateway Prototype"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201
    proj_data = res.json()["data"]
    assert proj_data["name"] == "IoT Gateway Prototype"
    proj_id = proj_data["id"]

    # 2. List projects (PROJECT-API-001)
    list_res = client.get(
        "/api/v1/projects",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_res.status_code == 200
    items = list_res.json()["data"]
    assert len(items) == 1
    assert items[0]["id"] == proj_id

    # 3. Get detail (PROJECT-API-003)
    detail_res = client.get(
        f"/api/v1/projects/{proj_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert detail_res.status_code == 200
    assert detail_res.json()["data"]["linked_requests"] == []

    # 4. Rename (PROJECT-API-004)
    patch_res = client.patch(
        f"/api/v1/projects/{proj_id}",
        json={"name": "IoT Gateway Production V2"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["data"]["name"] == "IoT Gateway Production V2"


def test_project_link_and_unlink_request():
    db = TestingSessionLocal()
    user, token = create_customer(db)

    # Create project
    proj = Project(id=uuid.uuid4(), user_id=user.id, name="Smart Meter")
    db.add(proj)

    # Create manufacturing request owned by user
    mfg = ManufacturingRequest(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Meter Enclosure",
        project_overview="Weatherproof casing",
        prototype_type="3d_printing",
        quantity=5,
        status="under_review",
    )
    db.add(mfg)
    db.commit()

    # Link request to project (PROJECT-API-005)
    link_res = client.post(
        f"/api/v1/projects/{proj.id}/link",
        json={"request_type": "manufacturing", "request_id": str(mfg.id)},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert link_res.status_code == 200

    # Verify linked in project detail
    detail_res = client.get(
        f"/api/v1/projects/{proj.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert detail_res.status_code == 200
    linked = detail_res.json()["data"]["linked_requests"]
    assert len(linked) == 1
    assert linked[0]["id"] == str(mfg.id)
    assert linked[0]["title"] == "Meter Enclosure"
    assert linked[0]["type"] == "manufacturing"

    # Unlink request (PROJECT-API-006)
    unlink_res = client.post(
        f"/api/v1/projects/{proj.id}/unlink",
        json={"request_type": "manufacturing", "request_id": str(mfg.id)},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert unlink_res.status_code == 200

    # Verify empty again
    detail_res2 = client.get(
        f"/api/v1/projects/{proj.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert detail_res2.json()["data"]["linked_requests"] == []


def test_project_aggregated_files():
    db = TestingSessionLocal()
    user, token = create_customer(db)

    proj = Project(id=uuid.uuid4(), user_id=user.id, name="Drone Project")
    db.add(proj)

    mfg = ManufacturingRequest(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=proj.id,
        title="Drone Arm CNC",
        project_overview="Carbon fiber arms",
        prototype_type="cnc_machining",
        quantity=4,
        status="under_review",
    )
    db.add(mfg)

    # Add file associated with mfg request
    file1 = ProjectFile(
        id=uuid.uuid4(),
        owner_id=user.id,
        project_id=proj.id,
        filename="arm_drawing.step",
        content_type="application/octet-stream",
        size_bytes=1024,
        storage_ref="dummy_ref",
        scan_status="clean",
        source="customer_upload",
        association_type="manufacturing",
        association_id=mfg.id,
    )
    db.add(file1)
    db.commit()

    # Get aggregated files (PROJECT-API-007)
    files_res = client.get(
        f"/api/v1/projects/{proj.id}/files",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert files_res.status_code == 200
    files = files_res.json()["data"]
    assert len(files) == 1
    assert files[0]["filename"] == "arm_drawing.step"


def test_project_idor_isolation():
    db = TestingSessionLocal()
    user1, token1 = create_customer(db, "u1@example.com")
    user2, token2 = create_customer(db, "u2@example.com")

    proj1 = Project(id=uuid.uuid4(), user_id=user1.id, name="User1 Secret Project")
    db.add(proj1)
    db.commit()

    # User 2 attempts to get User 1's project -> 404 (SEC-009)
    res = client.get(
        f"/api/v1/projects/{proj1.id}",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "PROJECT_NOT_FOUND"

    # User 2 attempts to rename User 1's project -> 404
    patch_res = client.patch(
        f"/api/v1/projects/{proj1.id}",
        json={"name": "Hacked Name"},
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert patch_res.status_code == 404
