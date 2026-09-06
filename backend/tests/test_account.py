import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User
from app.core.security import get_password_hash, create_access_token, verify_password
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_users_db():
    db = TestingSessionLocal()
    db.query(User).delete()
    db.commit()
    db.close()

def create_user(db, email="test@example.com", is_superuser=False):
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=get_password_hash("Pass123!"),
        full_name="Test User",
        is_active=True,
        is_superuser=is_superuser
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(subject=str(user.id), role="customer", audience="customer")
    return user, token

def test_own_profile_access():
    db = TestingSessionLocal()
    user, token = create_user(db)
    
    res = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["data"]["email"] == "test@example.com"

def test_unauthorized():
    res = client.get("/api/v1/users/me")
    assert res.status_code == 401

def test_profile_update():
    db = TestingSessionLocal()
    user, token = create_user(db)
    
    res = client.patch(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "New Name", "phone": "1234567890"}
    )
    assert res.status_code == 200
    assert res.json()["data"]["full_name"] == "New Name"
    assert res.json()["data"]["phone"] == "1234567890"

def test_password_change():
    db = TestingSessionLocal()
    user, token = create_user(db)
    
    res = client.post(
        "/api/v1/users/me/password-change",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "Pass123!", "new_password": "NewPassword123!"}
    )
    assert res.status_code == 200
    
    # Verify the password was actually updated in the DB
    db.refresh(user)
    assert verify_password("NewPassword123!", user.hashed_password)

def test_email_change():
    db = TestingSessionLocal()
    user, token = create_user(db)
    
    res = client.post(
        "/api/v1/users/me/email-change",
        headers={"Authorization": f"Bearer {token}"},
        json={"new_email": "new@example.com"}
    )
    assert res.status_code == 200
    assert res.json()["data"]["email"] == "new@example.com"
