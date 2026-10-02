import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import get_db
from app.models.user import User, RefreshToken, AuditEvent
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    validate_password_strength,
)
from app.workers.celery_app import celery_app
from tests.test_utils import TestingSessionLocal

celery_app.conf.task_always_eager = True
celery_app.conf.task_eager_propagates = True

client = TestClient(app)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def clean_db():
    db = TestingSessionLocal()
    db.query(RefreshToken).delete()
    db.query(AuditEvent).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def create_test_admin(
    email: str = "super@venopai.com",
    role: str = "SUPER_ADMIN",
    password: str = "RootPassword123!",
    is_active: bool = True,
    status: str = "verified",
) -> User:
    db = TestingSessionLocal()
    user = User(
        id=uuid.uuid4(),
        email=email,
        full_name="Test " + role,
        hashed_password=get_password_hash(password),
        role=role,
        is_superuser=(role == "SUPER_ADMIN"),
        is_active=is_active,
        status=status,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


def get_admin_headers(user: User) -> dict:
    token = create_access_token(
        subject=user.id,
        role=user.role,
        is_admin=True,
        audience="admin",
        expires_delta=timedelta(hours=2),
    )
    return {"Authorization": f"Bearer {token}"}


def get_err_code(res) -> str:
    data = res.json()
    if "error" in data and isinstance(data["error"], dict):
        return data["error"].get("code")
    if "detail" in data and isinstance(data["detail"], dict):
        return data["detail"].get("code")
    return ""


# ----------------- CLI BOOTSTRAP TESTS -----------------

def test_cli_admin_create_and_update(monkeypatch):
    from app.cli.create_admin import create_or_update_admin
    import app.cli.create_admin as cli_mod
    monkeypatch.setattr(cli_mod, "SessionLocal", TestingSessionLocal)

    create_or_update_admin(
        email="cli.admin@venopai.com",
        full_name="CLI SuperAdmin",
        password="ValidCliPassword123!",
        role="SUPER_ADMIN",
    )

    db = TestingSessionLocal()
    admin = db.query(User).filter(User.email == "cli.admin@venopai.com").first()
    assert admin is not None
    assert admin.role == "SUPER_ADMIN"
    assert admin.is_superuser is True
    assert admin.status == "verified"
    assert verify_password("ValidCliPassword123!", admin.hashed_password)

    audit = db.query(AuditEvent).filter(AuditEvent.entity_id == admin.id).first()
    assert audit is not None
    assert audit.action == "admin.cli_bootstrap"
    db.close()


# ----------------- STAFF CREATION & LISTING -----------------

def test_list_team_staff_as_superadmin():
    super_admin = create_test_admin("super1@venopai.com", "SUPER_ADMIN")
    create_test_admin("order1@venopai.com", "ORDER_MANAGER")
    create_test_admin("mfg1@venopai.com", "MANUFACTURING_MANAGER")

    headers = get_admin_headers(super_admin)
    res = client.get("/api/v1/admin/team", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data["data"]) == 3
    assert data["pagination"]["total_items"] == 3


def test_list_team_staff_forbidden_for_non_superadmin():
    order_mgr = create_test_admin("order_mgr@venopai.com", "ORDER_MANAGER")
    headers = get_admin_headers(order_mgr)

    res = client.get("/api/v1/admin/team", headers=headers)
    assert res.status_code == 403
    assert get_err_code(res) == "INSUFFICIENT_PERMISSIONS"


def test_create_staff_member_success():
    super_admin = create_test_admin("super@venopai.com", "SUPER_ADMIN")
    headers = get_admin_headers(super_admin)

    payload = {
        "email": "finance@venopai.com",
        "full_name": "Finance Head",
        "phone": "+919876543210",
        "role": "FINANCE_MANAGER",
        "password": "InitialPassword123!",
    }
    res = client.post("/api/v1/admin/team", json=payload, headers=headers)
    assert res.status_code == 201
    res_data = res.json()["data"]
    assert res_data["email"] == "finance@venopai.com"
    assert res_data["role"] == "FINANCE_MANAGER"
    assert res_data["temporary_password"] == "InitialPassword123!"

    db = TestingSessionLocal()
    new_staff = db.query(User).filter(User.email == "finance@venopai.com").first()
    assert new_staff is not None
    assert new_staff.role == "FINANCE_MANAGER"
    assert new_staff.is_superuser is False
    assert verify_password("InitialPassword123!", new_staff.hashed_password)

    audit = db.query(AuditEvent).filter(AuditEvent.entity_id == new_staff.id).first()
    assert audit is not None
    assert audit.action == "admin.staff_created"
    db.close()


def test_create_staff_duplicate_email():
    super_admin = create_test_admin("super@venopai.com", "SUPER_ADMIN")
    headers = get_admin_headers(super_admin)

    payload = {
        "email": "super@venopai.com",
        "full_name": "Another Super Admin",
        "role": "ADMIN",
        "password": "AnotherPassword123!",
    }
    res = client.post("/api/v1/admin/team", json=payload, headers=headers)
    assert res.status_code == 409
    assert get_err_code(res) == "EMAIL_ALREADY_EXISTS"


def test_create_staff_invalid_role():
    super_admin = create_test_admin("super@venopai.com", "SUPER_ADMIN")
    headers = get_admin_headers(super_admin)

    payload = {
        "email": "hacker@venopai.com",
        "full_name": "Invalid Role Admin",
        "role": "GOD_MODE_ADMIN",
        "password": "ValidPassword123!",
    }
    res = client.post("/api/v1/admin/team", json=payload, headers=headers)
    assert res.status_code == 422
    assert get_err_code(res) == "INVALID_ADMIN_ROLE"


def test_create_staff_weak_password():
    super_admin = create_test_admin("super@venopai.com", "SUPER_ADMIN")
    headers = get_admin_headers(super_admin)

    payload = {
        "email": "weak@venopai.com",
        "full_name": "Weak Pwd Admin",
        "role": "ADMIN",
        "password": "weakpassword123",  # no uppercase, no symbol
    }
    res = client.post("/api/v1/admin/team", json=payload, headers=headers)
    assert res.status_code == 422
    assert get_err_code(res) == "WEAK_PASSWORD"


# ----------------- ROLE & STATUS MUTATION TESTS -----------------

def test_update_staff_role():
    super_admin = create_test_admin("super@venopai.com", "SUPER_ADMIN")
    support = create_test_admin("support@venopai.com", "SUPPORT_EXECUTIVE")
    headers = get_admin_headers(super_admin)

    res = client.patch(
        f"/api/v1/admin/team/{support.id}/role",
        json={"role": "ORDER_MANAGER"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["data"]["role"] == "ORDER_MANAGER"

    db = TestingSessionLocal()
    updated = db.query(User).filter(User.id == support.id).first()
    assert updated.role == "ORDER_MANAGER"
    db.close()


def test_self_demotion_forbidden():
    super_admin = create_test_admin("super@venopai.com", "SUPER_ADMIN")
    headers = get_admin_headers(super_admin)

    res = client.patch(
        f"/api/v1/admin/team/{super_admin.id}/role",
        json={"role": "ADMIN"},
        headers=headers,
    )
    assert res.status_code == 400
    assert get_err_code(res) == "SELF_DEMOTION_FORBIDDEN"


def test_last_superadmin_demotion_forbidden():
    super_admin = create_test_admin("onlysuper@venopai.com", "SUPER_ADMIN")
    second_super = create_test_admin("secondsuper@venopai.com", "SUPER_ADMIN")
    headers = get_admin_headers(super_admin)

    # Demote second superadmin -> now only 1 superadmin left
    res1 = client.patch(
        f"/api/v1/admin/team/{second_super.id}/role",
        json={"role": "ADMIN"},
        headers=headers,
    )
    assert res1.status_code == 200

    # Try to demote the sole superadmin
    res2 = client.patch(
        f"/api/v1/admin/team/{super_admin.id}/role",
        json={"role": "ADMIN"},
        headers=headers,
    )
    assert res2.status_code == 400
    assert get_err_code(res2) in ("SELF_DEMOTION_FORBIDDEN", "LAST_SUPERADMIN_DEMOTION_FORBIDDEN")


def test_update_staff_status_deactivate_and_activate():
    super_admin = create_test_admin("super@venopai.com", "SUPER_ADMIN")
    staff = create_test_admin("staff@venopai.com", "ORDER_MANAGER")

    db = TestingSessionLocal()
    token = RefreshToken(
        user_id=staff.id,
        token="active_token_123",
        family_id=uuid.uuid4(),
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        revoked=False,
    )
    db.add(token)
    db.commit()
    db.close()

    headers = get_admin_headers(super_admin)

    # Deactivate
    res_deact = client.patch(
        f"/api/v1/admin/team/{staff.id}/status",
        json={"status": "deactivated"},
        headers=headers,
    )
    assert res_deact.status_code == 200
    assert res_deact.json()["data"]["status"] == "deactivated"
    assert res_deact.json()["data"]["is_active"] is False

    db = TestingSessionLocal()
    tok_check = db.query(RefreshToken).filter(RefreshToken.user_id == staff.id).first()
    assert tok_check.revoked is True
    db.close()

    # Reactivate
    res_act = client.patch(
        f"/api/v1/admin/team/{staff.id}/status",
        json={"status": "verified"},
        headers=headers,
    )
    assert res_act.status_code == 200
    assert res_act.json()["data"]["status"] == "verified"
    assert res_act.json()["data"]["is_active"] is True


def test_self_deactivation_forbidden():
    super_admin = create_test_admin("super@venopai.com", "SUPER_ADMIN")
    headers = get_admin_headers(super_admin)

    res = client.patch(
        f"/api/v1/admin/team/{super_admin.id}/status",
        json={"status": "deactivated"},
        headers=headers,
    )
    assert res.status_code == 400
    assert get_err_code(res) == "SELF_DEACTIVATION_FORBIDDEN"


# ----------------- PASSWORD MANAGEMENT TESTS -----------------

def test_superadmin_reset_password_override():
    super_admin = create_test_admin("super@venopai.com", "SUPER_ADMIN")
    staff = create_test_admin("locked@venopai.com", "FINANCE_MANAGER", password="OldPassword123!")

    headers = get_admin_headers(super_admin)
    res = client.post(
        f"/api/v1/admin/team/{staff.id}/reset-password",
        json={"new_password": "NewResetPassword123!"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["data"]["temporary_password"] == "NewResetPassword123!"

    # Verify staff can log in with new password
    login_res = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "locked@venopai.com", "password": "NewResetPassword123!"},
    )
    assert login_res.status_code == 200


def test_self_service_change_password_success():
    admin = create_test_admin("myself@venopai.com", "ORDER_MANAGER", password="OriginalPassword123!")
    headers = get_admin_headers(admin)

    # Change password
    payload = {
        "current_password": "OriginalPassword123!",
        "new_password": "BrandNewPassword123!",
        "confirm_password": "BrandNewPassword123!",
    }
    res = client.post("/api/v1/admin/auth/change-password", json=payload, headers=headers)
    assert res.status_code == 200
    assert "Password changed successfully" in res.json()["data"]["message"]

    # Verify old password fails
    fail_res = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "myself@venopai.com", "password": "OriginalPassword123!"},
    )
    assert fail_res.status_code == 401

    # Verify new password succeeds
    ok_res = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "myself@venopai.com", "password": "BrandNewPassword123!"},
    )
    assert ok_res.status_code == 200


def test_self_service_change_password_wrong_current():
    admin = create_test_admin("wrong_test@venopai.com", "ORDER_MANAGER", password="OriginalPassword123!")
    headers = get_admin_headers(admin)

    payload = {
        "current_password": "WrongPassword123!",
        "new_password": "BrandNewPassword123!",
        "confirm_password": "BrandNewPassword123!",
    }
    res = client.post("/api/v1/admin/auth/change-password", json=payload, headers=headers)
    assert res.status_code == 400
    assert get_err_code(res) == "INVALID_CURRENT_PASSWORD"


def test_self_service_change_password_mismatch():
    admin = create_test_admin("mismatch@venopai.com", "ORDER_MANAGER", password="OriginalPassword123!")
    headers = get_admin_headers(admin)

    payload = {
        "current_password": "OriginalPassword123!",
        "new_password": "BrandNewPassword123!",
        "confirm_password": "DifferentPassword123!",
    }
    res = client.post("/api/v1/admin/auth/change-password", json=payload, headers=headers)
    assert res.status_code == 400
    assert get_err_code(res) == "PASSWORD_MISMATCH"


def test_self_service_change_password_weak():
    admin = create_test_admin("weak_test@venopai.com", "ORDER_MANAGER", password="OriginalPassword123!")
    headers = get_admin_headers(admin)

    payload = {
        "current_password": "OriginalPassword123!",
        "new_password": "weakpassword123",  # 15 chars, but no uppercase, no symbol
        "confirm_password": "weakpassword123",
    }
    res = client.post("/api/v1/admin/auth/change-password", json=payload, headers=headers)
    assert res.status_code == 422
    assert get_err_code(res) == "WEAK_PASSWORD"


def test_deactivated_admin_cannot_login():
    create_test_admin("deact@venopai.com", "ORDER_MANAGER", password="Password123!", status="deactivated", is_active=False)

    res = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "deact@venopai.com", "password": "Password123!"},
    )
    assert res.status_code == 403
    assert get_err_code(res) == "ACCOUNT_DEACTIVATED"
