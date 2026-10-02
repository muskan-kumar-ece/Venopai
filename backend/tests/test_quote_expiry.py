import uuid
from datetime import datetime, timezone, timedelta
import pytest
from app.models.user import User
from app.models.project import Project, Quote, QuoteVersion
import app.workers.tasks.quotes as quotes_task_module
from app.workers.tasks.quotes import expire_quotes_task
from app.workers.celery_app import celery_app
from tests.test_utils import TestingSessionLocal

@pytest.fixture
def db():
    session = TestingSessionLocal()
    yield session
    session.close()

def test_celery_beat_schedules_contract_compliance():
    schedule = celery_app.conf.beat_schedule
    # All 6 periodic maintenance tasks required by Doc 02 §19
    assert schedule["release-expired-inventory-reservations-every-minute"]["schedule"] == 60.0
    assert schedule["expire-quotes-every-15-minutes"]["schedule"] == 900.0
    assert schedule["reconcile-stale-pending-payments-every-15-minutes"]["schedule"] == 900.0
    assert schedule["sync-active-shipments-every-30-minutes"]["schedule"] == 1800.0
    assert schedule["retry-failed-notifications-every-5-minutes"]["schedule"] == 300.0
    assert schedule["check-consultation-inactivity-daily"]["schedule"] == 86400.0

def test_expire_quotes_task_transitions_stale_quotes(db, monkeypatch):
    monkeypatch.setattr(quotes_task_module, "SessionLocal", TestingSessionLocal)

    user = User(
        id=uuid.uuid4(),
        email=f"quote_exp_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hash",
        full_name="Quote User",
        is_active=True,
    )
    db.add(user)
    db.commit()

    project = Project(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Telemetry PCB",
    )
    db.add(project)
    db.commit()

    quote = Quote(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        status="sent",
    )
    db.add(quote)
    db.commit()

    # Expired quote version (valid_until 2 days ago)
    expired_version = QuoteVersion(
        id=uuid.uuid4(),
        quote_id=quote.id,
        version=1,
        total_amount=4500000,
        subtotal_paise=4000000,
        tax_paise=500000,
        valid_until=datetime.now(timezone.utc) - timedelta(days=2),
        status="sent",
    )
    db.add(expired_version)

    # Active quote version (valid_until 5 days ahead)
    quote_active = Quote(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        status="sent",
    )
    db.add(quote_active)
    db.commit()

    active_version = QuoteVersion(
        id=uuid.uuid4(),
        quote_id=quote_active.id,
        version=1,
        total_amount=2500000,
        subtotal_paise=2200000,
        tax_paise=300000,
        valid_until=datetime.now(timezone.utc) + timedelta(days=5),
        status="sent",
    )
    db.add(active_version)
    db.commit()

    result = expire_quotes_task()
    assert result >= 1

    db.refresh(expired_version)
    assert expired_version.status == "expired"

    db.refresh(active_version)
    assert active_version.status == "sent"
