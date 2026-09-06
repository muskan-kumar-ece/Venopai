import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.engagement import Notification
from app.models.user import User
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_db():
    db = TestingSessionLocal()
    db.query(Notification).delete()
    db.query(User).delete()
    db.commit()
    db.close()

def create_user(db, email="test@example.com"):
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=get_password_hash("Pass123!"),
        full_name="Test User",
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(subject=str(user.id), role="customer", audience="customer")
    return user, token

def test_get_my_notifications():
    db = TestingSessionLocal()
    user, token = create_user(db)
    
    notif = Notification(id=uuid.uuid4(), user_id=user.id, title="Test", message="Test Message")
    db.add(notif)
    db.commit()

    res = client.get("/api/v1/notifications", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert len(res.json()["data"]) == 1
    assert res.json()["data"][0]["title"] == "Test"
