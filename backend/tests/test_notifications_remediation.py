import uuid
from datetime import datetime, timezone
import pytest
from app.models.engagement import Notification
from app.models.user import User
from app.services.notification import NotificationService
import app.workers.tasks.notification as notif_task_module
from app.workers.tasks.notification import send_notification_email_task, retry_failed_notifications
from app.integrations.resend.client import resend_provider
from tests.test_utils import TestingSessionLocal

@pytest.fixture
def db():
    session = TestingSessionLocal()
    yield session
    session.close()

def test_notification_model_contract_fields(db):
    user = User(
        id=uuid.uuid4(),
        email=f"notif_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hash",
        full_name="Notif User",
        is_active=True,
    )
    db.add(user)
    db.commit()

    idemp_key = f"key_{uuid.uuid4().hex}"
    notif = Notification(
        id=uuid.uuid4(),
        user_id=user.id,
        event_type="order.placed",
        title="Order Received",
        message="Your hardware order has been placed.",
        status="pending",
        idempotency_key=idemp_key,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)

    assert notif.status == "pending"
    assert notif.event_type == "order.placed"
    assert notif.idempotency_key == idemp_key
    assert notif.subject == "Order Received"
    assert notif.retry_count == 0

def test_notification_service_idempotency(db):
    user = User(
        id=uuid.uuid4(),
        email=f"idemp_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hash",
        full_name="Idemp User",
        is_active=True,
    )
    db.add(user)
    db.commit()

    shared_key = f"shared_{uuid.uuid4().hex}"

    notif1 = NotificationService.notify(
        db=db,
        user_id=user.id,
        title="Quote Ready",
        message="Your fabrication quote is ready for review.",
        event_type="quote.issued",
        idempotency_key=shared_key,
    )

    notif2 = NotificationService.notify(
        db=db,
        user_id=user.id,
        title="Quote Ready",
        message="Your fabrication quote is ready for review.",
        event_type="quote.issued",
        idempotency_key=shared_key,
    )

    assert notif1.id == notif2.id

    count = db.query(Notification).filter(Notification.idempotency_key == shared_key).count()
    assert count == 1

def test_resend_provider_mock_delivery():
    res = resend_provider.send(
        to="engineer@venopai.com",
        subject="DFM Review Completed",
        text_body="Gerber layers passed automated verification.",
    )
    assert res.get("status") in ("sent", "delivered")
    assert "id" in res

def test_send_notification_email_task_execution(db, monkeypatch):
    monkeypatch.setattr(notif_task_module, "SessionLocal", TestingSessionLocal)

    user = User(
        id=uuid.uuid4(),
        email=f"task_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hash",
        full_name="Task User",
        is_active=True,
    )
    db.add(user)
    db.commit()

    notif = Notification(
        id=uuid.uuid4(),
        user_id=user.id,
        event_type="shipping.dispatched",
        title="Shipment Dispatched",
        message="Your boards are on the way via Delhivery.",
        status="pending",
    )
    db.add(notif)
    db.commit()

    result = send_notification_email_task(str(notif.id))
    assert result is True

    db.refresh(notif)
    assert notif.status == "sent"
    assert notif.sent_at is not None

def test_retry_failed_notifications(db, monkeypatch):
    monkeypatch.setattr(notif_task_module, "SessionLocal", TestingSessionLocal)

    user = User(
        id=uuid.uuid4(),
        email=f"retry_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hash",
        full_name="Retry User",
        is_active=True,
    )
    db.add(user)
    db.commit()

    notif = Notification(
        id=uuid.uuid4(),
        user_id=user.id,
        event_type="payment.confirmed",
        title="Payment Confirmed",
        message="₹12,500 received.",
        status="failed",
        retry_count=1,
    )
    db.add(notif)
    db.commit()

    res = retry_failed_notifications()
    assert res >= 1
