import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.session import Base
from app.api.deps import get_db, get_current_admin
from app.models.user import User, RefreshToken, EmailVerificationToken, PasswordResetToken
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    hash_token,
)
from app.schemas.auth import UserCreate
from app.workers.celery_app import celery_app

celery_app.conf.task_always_eager = True
celery_app.conf.task_eager_propagates = True

# SQLite In-Memory Database with StaticPool for deterministic multi-connection testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_db():
    db = TestingSessionLocal()
    db.query(RefreshToken).delete()
    db.query(EmailVerificationToken).delete()
    db.query(PasswordResetToken).delete()
    db.query(User).delete()
    db.commit()
    db.close()

# ----------------- REGISTRATION TESTS -----------------

def test_register_success():
    response = client.post("/api/v1/auth/register", json={
        "email": "student@example.com",
        "password": "StrongPassword123!",
        "full_name": "Aarav Sharma",
        "phone": "+919812345678"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["data"]["email"] == "student@example.com"
    assert data["data"]["full_name"] == "Aarav Sharma"
    assert data["data"]["status"] == "registered"
    assert "id" in data["data"]
    assert "request_id" in data

    # Verify DB state
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "student@example.com").first()
    assert user is not None
    assert user.status == "registered"
    assert verify_password("StrongPassword123!", user.hashed_password)
    
    # Verify EmailVerificationToken was created
    token_rec = db.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id).first()
    assert token_rec is not None
    assert token_rec.used is False
    db.close()

def test_register_duplicate_email_409():
    payload = {
        "email": "student@example.com",
        "password": "StrongPassword123!",
        "full_name": "Aarav Sharma"
    }
    res1 = client.post("/api/v1/auth/register", json=payload)
    assert res1.status_code == 201

    # Exact duplicate
    res2 = client.post("/api/v1/auth/register", json=payload)
    assert res2.status_code == 409
    assert res2.json()["error"]["code"] == "EMAIL_ALREADY_EXISTS"

    # Case-insensitive duplicate
    payload["email"] = "STUDENT@EXAMPLE.COM"
    res3 = client.post("/api/v1/auth/register", json=payload)
    assert res3.status_code == 409
    assert res3.json()["error"]["code"] == "EMAIL_ALREADY_EXISTS"

def test_register_weak_password_422():
    res = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "weak",
        "full_name": "Test User"
    })
    assert res.status_code == 422
    assert "error" in res.json()

# ----------------- EMAIL VERIFICATION TESTS -----------------

def test_verify_email_success():
    client.post("/api/v1/auth/register", json={
        "email": "student@example.com",
        "password": "StrongPassword123!",
        "full_name": "Aarav Sharma"
    })
    db = TestingSessionLocal()
    token_rec = db.query(EmailVerificationToken).first()
    # In test, token_hash is stored. Let's create a known raw token
    raw_token = "my_secret_verify_token"
    token_rec.token_hash = hash_token(raw_token)
    db.commit()
    db.close()

    res = client.post("/api/v1/auth/verify-email", json={"token": raw_token})
    assert res.status_code == 200
    assert res.json()["data"]["status"] == "verified"

    # Verify user state in DB is updated to 'verified'
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "student@example.com").first()
    assert user.status == "verified"
    token_rec = db.query(EmailVerificationToken).first()
    assert token_rec.used is True
    db.close()

def test_verify_email_already_used_400():
    client.post("/api/v1/auth/register", json={
        "email": "student@example.com",
        "password": "StrongPassword123!",
        "full_name": "Aarav Sharma"
    })
    db = TestingSessionLocal()
    token_rec = db.query(EmailVerificationToken).first()
    raw_token = "my_token_used"
    token_rec.token_hash = hash_token(raw_token)
    token_rec.used = True
    db.commit()
    db.close()

    res = client.post("/api/v1/auth/verify-email", json={"token": raw_token})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "TOKEN_ALREADY_USED"

def test_resend_verification_enumeration_safe():
    # Existing user
    client.post("/api/v1/auth/register", json={
        "email": "student@example.com",
        "password": "StrongPassword123!",
        "full_name": "Aarav Sharma"
    })
    res1 = client.post("/api/v1/auth/resend-verification", json={"email": "student@example.com"})
    assert res1.status_code == 202
    assert "If an account exists" in res1.json()["data"]["message"]

    # Non-existing user
    res2 = client.post("/api/v1/auth/resend-verification", json={"email": "doesnotexist@example.com"})
    assert res2.status_code == 202
    assert "If an account exists" in res2.json()["data"]["message"]

# ----------------- LOGIN TESTS -----------------

def test_login_success():
    client.post("/api/v1/auth/register", json={
        "email": "student@example.com",
        "password": "StrongPassword123!",
        "full_name": "Aarav Sharma"
    })
    res = client.post("/api/v1/auth/login", json={
        "email": "student@example.com",
        "password": "StrongPassword123!"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data["data"]
    assert data["data"]["token_type"] == "bearer"
    assert data["data"]["user"]["email"] == "student@example.com"
    assert data["data"]["user"]["status"] == "registered" # Unverified can still log in!
    
    # Cookies check: refresh_token and csrf_token must be set
    assert "refresh_token" in res.cookies
    assert "csrf_token" in res.cookies

def test_login_invalid_password_401():
    client.post("/api/v1/auth/register", json={
        "email": "student@example.com",
        "password": "StrongPassword123!",
        "full_name": "Aarav Sharma"
    })
    res = client.post("/api/v1/auth/login", json={
        "email": "student@example.com",
        "password": "WrongPassword123!"
    })
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "INVALID_CREDENTIALS"

def test_login_deactivated_403():
    client.post("/api/v1/auth/register", json={
        "email": "student@example.com",
        "password": "StrongPassword123!",
        "full_name": "Aarav Sharma"
    })
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "student@example.com").first()
    user.status = "deactivated"
    db.commit()
    db.close()

    res = client.post("/api/v1/auth/login", json={
        "email": "student@example.com",
        "password": "StrongPassword123!"
    })
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "ACCOUNT_DEACTIVATED"

# ----------------- CURRENT USER (AUTH/ME vs USERS/ME) -----------------

def test_auth_me_and_users_me_distinct():
    client.post("/api/v1/auth/register", json={
        "email": "student@example.com",
        "password": "StrongPassword123!",
        "full_name": "Aarav Sharma",
        "phone": "+919812345678"
    })
    login_res = client.post("/api/v1/auth/login", json={
        "email": "student@example.com",
        "password": "StrongPassword123!"
    })
    token = login_res.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Test GET /api/v1/auth/me
    auth_me_res = client.get("/api/v1/auth/me", headers=headers)
    assert auth_me_res.status_code == 200
    auth_data = auth_me_res.json()["data"]
    assert auth_data["email"] == "student@example.com"
    assert auth_data["is_admin"] is False
    assert "phone" not in auth_data # auth/me does not include phone

    # Test GET /api/v1/users/me (User domain profile)
    users_me_res = client.get("/api/v1/users/me", headers=headers)
    assert users_me_res.status_code == 200
    users_data = users_me_res.json()["data"]
    assert users_data["email"] == "student@example.com"
    assert users_data["phone"] == "+919812345678"

# ----------------- REFRESH TOKEN & REUSE DETECTION -----------------

def test_refresh_token_rotation_and_csrf():
    client.post("/api/v1/auth/register", json={
        "email": "student@example.com",
        "password": "StrongPassword123!",
        "full_name": "Aarav Sharma"
    })
    login_res = client.post("/api/v1/auth/login", json={
        "email": "student@example.com",
        "password": "StrongPassword123!"
    })
    refresh_token = login_res.cookies.get("refresh_token")
    csrf_token = login_res.cookies.get("csrf_token")

    # Missing CSRF header should return 403
    res_no_csrf = client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": refresh_token}
    )
    assert res_no_csrf.status_code == 403
    assert res_no_csrf.json()["error"]["code"] == "CSRF_TOKEN_MISSING"

    # Mismatched CSRF header should return 403
    res_bad_csrf = client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": refresh_token},
        headers={"X-CSRF-Token": "invalid_csrf_token"}
    )
    assert res_bad_csrf.status_code == 403
    assert res_bad_csrf.json()["error"]["code"] == "CSRF_TOKEN_MISMATCH"

    # Successful Refresh with rotation
    res_refresh = client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": refresh_token},
        headers={"X-CSRF-Token": csrf_token}
    )
    assert res_refresh.status_code == 200
    new_data = res_refresh.json()["data"]
    assert "access_token" in new_data
    new_refresh_token = res_refresh.cookies.get("refresh_token")
    assert new_refresh_token != refresh_token

    # CRITICAL: Replay detection — reusing the old revoked refresh token!
    res_replay = client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": refresh_token},
        headers={"X-CSRF-Token": csrf_token}
    )
    assert res_replay.status_code == 401
    assert res_replay.json()["error"]["code"] == "TOKEN_REUSE_DETECTED"

    # Verify that the entire token family was revoked
    db = TestingSessionLocal()
    unrevoked_tokens = db.query(RefreshToken).filter(RefreshToken.revoked == False).count()
    assert unrevoked_tokens == 0
    db.close()

# ----------------- LOGOUT TESTS -----------------

def test_logout_204():
    client.post("/api/v1/auth/register", json={
        "email": "student@example.com",
        "password": "StrongPassword123!",
        "full_name": "Aarav Sharma"
    })
    login_res = client.post("/api/v1/auth/login", json={
        "email": "student@example.com",
        "password": "StrongPassword123!"
    })
    refresh_token = login_res.cookies.get("refresh_token")

    res = client.post("/api/v1/auth/logout", cookies={"refresh_token": refresh_token})
    assert res.status_code == 204

    db = TestingSessionLocal()
    db_token = db.query(RefreshToken).filter(RefreshToken.token == refresh_token).first()
    assert db_token.revoked is True
    db.close()

# ----------------- FORGOT & RESET PASSWORD TESTS -----------------

def test_forgot_and_reset_password():
    client.post("/api/v1/auth/register", json={
        "email": "student@example.com",
        "password": "StrongPassword123!",
        "full_name": "Aarav Sharma"
    })
    forgot_res = client.post("/api/v1/auth/forgot-password", json={"email": "student@example.com"})
    assert forgot_res.status_code == 202

    db = TestingSessionLocal()
    reset_rec = db.query(PasswordResetToken).first()
    raw_token = "my_reset_token_secret"
    reset_rec.token_hash = hash_token(raw_token)
    db.commit()
    db.close()

    # Reset password
    reset_res = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "new_password": "BrandNewPassword456!"
    })
    assert reset_res.status_code == 200
    assert reset_res.json()["data"]["status"] == "password_reset"

    # Verify login with new password works
    login_res = client.post("/api/v1/auth/login", json={
        "email": "student@example.com",
        "password": "BrandNewPassword456!"
    })
    assert login_res.status_code == 200

# ----------------- ADMIN AUTHENTICATION TESTS -----------------

def test_admin_auth_login_and_boundary():
    # Create an admin user
    db = TestingSessionLocal()
    admin = User(
        email="admin@venopai.com",
        hashed_password=get_password_hash("AdminPass123!"),
        full_name="Super Admin",
        status="verified",
        role="SUPER_ADMIN",
        is_superuser=True,
    )
    # Create regular customer
    customer = User(
        email="customer@example.com",
        hashed_password=get_password_hash("CustomerPass123!"),
        full_name="Regular Customer",
        status="verified",
        role="customer",
        is_superuser=False,
    )
    db.add_all([admin, customer])
    db.commit()
    db.close()

    # Customer trying admin login -> 401
    res_cust_to_admin = client.post("/api/v1/admin/auth/login", json={
        "email": "customer@example.com",
        "password": "CustomerPass123!"
    })
    assert res_cust_to_admin.status_code == 401

    # Admin login success -> 200
    res_admin = client.post("/api/v1/admin/auth/login", json={
        "email": "admin@venopai.com",
        "password": "AdminPass123!"
    })
    assert res_admin.status_code == 200
    admin_data = res_admin.json()["data"]
    assert admin_data["user"]["is_admin"] is True
    admin_token = admin_data["access_token"]

    # Customer login
    res_cust = client.post("/api/v1/auth/login", json={
        "email": "customer@example.com",
        "password": "CustomerPass123!"
    })
    cust_token = res_cust.json()["data"]["access_token"]

    # Verify token boundary: Customer token decoded via get_current_admin raises 403
    db = TestingSessionLocal()
    with pytest.raises(Exception) as exc_info:
        get_current_admin(db, cust_token)
    assert exc_info.value.status_code == 403
    
    # Admin token passes get_current_admin
    resolved_admin = get_current_admin(db, admin_token)
    assert resolved_admin.email == "admin@venopai.com"
    db.close()
