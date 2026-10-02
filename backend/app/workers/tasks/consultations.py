import os
import uuid
import json
from datetime import datetime, timezone, timedelta
from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.project import ConsultationRequest
from app.models.user import AuditEvent


from app.core.config import settings


@celery_app.task(name="consultation.check_inactivity_auto_close")
def check_inactivity_auto_close(days: int = None, db=None):
    """Document 01 §34 & Document 02 §19:
    Auto-close consultations past the inactivity threshold (configured via settings).
    """
    if days is None:
        days = getattr(settings, "CONSULTATION_INACTIVITY_DAYS", 14)

    close_db = False
    if db is None:
        if os.environ.get("PYTEST_CURRENT_TEST"):
            try:
                from tests.test_utils import TestingSessionLocal
                db = TestingSessionLocal()
            except ImportError:
                db = SessionLocal()
        else:
            db = SessionLocal()
        close_db = True

    try:
        now = datetime.now(timezone.utc)
        cutoff_date = now - timedelta(days=days)

        # Non-terminal consultations idle for > cutoff
        stale_consultations = db.query(ConsultationRequest).filter(
            ConsultationRequest.status.in_(["submitted", "in_progress", "responded"]),
            ConsultationRequest.updated_at <= cutoff_date,
        ).all()

        closed_count = 0
        for consult in stale_consultations:
            consult.status = "closed"
            consult.internal_notes = (consult.internal_notes or "") + f" [System auto-closed after {days} days inactivity]"
            consult.updated_at = now

            audit = AuditEvent(
                id=uuid.uuid4(),
                user_id=consult.user_id,
                action="CONSULTATION_INACTIVITY_AUTO_CLOSED",
                entity_type="ConsultationRequest",
                entity_id=consult.id,
                details=json.dumps({"reason": f"{days}_days_inactivity"}),
                created_at=now,
            )
            db.add(audit)
            closed_count += 1

        db.commit()
        return closed_count
    except Exception as exc:
        db.rollback()
        raise exc
    finally:
        if close_db:
            db.close()
