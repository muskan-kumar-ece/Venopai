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
    body = res.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["title"] == "Test"
    assert "pagination" in body
    assert body["pagination"]["total_items"] == 1


def test_notifications_cross_customer_isolation():
    """NOTIF-API-001: customers must only see their own notifications."""
    db = TestingSessionLocal()
    user1, token1 = create_user(db, "u1@test.com")
    user2, token2 = create_user(db, "u2@test.com")

    notif = Notification(id=uuid.uuid4(), user_id=user1.id, title="Private", message="For u1 only")
    db.add(notif)
    db.commit()

    res = client.get("/api/v1/notifications", headers={"Authorization": f"Bearer {token2}"})
    assert res.status_code == 200
    assert len(res.json()["data"]) == 0


def test_notifications_pagination():
    """NOTIF-API-001: pagination parameters work correctly."""
    db = TestingSessionLocal()
    user, token = create_user(db)

    for i in range(5):
        db.add(Notification(id=uuid.uuid4(), user_id=user.id, title=f"N{i}", message="msg"))
    db.commit()

    res = client.get("/api/v1/notifications?page=1&page_size=2", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    body = res.json()
    assert len(body["data"]) == 2
    assert body["pagination"]["total_items"] == 5
    assert body["pagination"]["total_pages"] == 3

