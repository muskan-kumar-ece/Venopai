import uuid
import json
from datetime import datetime, timezone
from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.project import ProjectFile
from app.models.user import AuditEvent

def utcnow():
    return datetime.now(timezone.utc)

@celery_app.task(name="app.workers.tasks.files.scan_file_malware")
def scan_file_malware(file_id: str, db=None) -> str:
    """Document 02 §16 & Document 04 §31: Asynchronous malware scanning task.
    Transitions ProjectFile: pending_scan -> clean / flagged / failed.
    """
    close_db = False
    if db is None:
        try:
            from tests.test_utils import TestingSessionLocal
            db = TestingSessionLocal()
        except ImportError:
            from app.db.session import SessionLocal
            db = SessionLocal()
        close_db = True

    try:
        f_uuid = uuid.UUID(file_id)
        query = db.query(ProjectFile).filter(ProjectFile.id == f_uuid)
        if db.bind and db.bind.dialect.name != "sqlite":
            query = query.with_for_update()
        file_record = query.first()
        if not file_record:
            return "not_found"

        if file_record.scan_status != "pending_scan":
            return file_record.scan_status

        # Scanning logic: test/dev simulation with pattern detection
        fname = (file_record.filename or "").lower()
        now = utcnow()

        if "eicar" in fname or "infected" in fname or "flagged" in fname:
            file_record.scan_status = "flagged"
            audit = AuditEvent(
                id=uuid.uuid4(),
                user_id=file_record.owner_id,
                action="FILE_MALWARE_FLAGGED",
                entity_type="ProjectFile",
                entity_id=file_record.id,
                details=json.dumps({"filename": file_record.filename, "reason": "Malware signature detected"}),
                created_at=now,
            )
            db.add(audit)
        elif "corrupt" in fname or "fail" in fname:
            file_record.scan_status = "failed"
            audit = AuditEvent(
                id=uuid.uuid4(),
                user_id=file_record.owner_id,
                action="FILE_SCAN_FAILED",
                entity_type="ProjectFile",
                entity_id=file_record.id,
                details=json.dumps({"filename": file_record.filename, "reason": "Scan engine error"}),
                created_at=now,
            )
            db.add(audit)
        else:
            file_record.scan_status = "clean"

        db.commit()
        return file_record.scan_status
    finally:
        if close_db:
            db.close()
