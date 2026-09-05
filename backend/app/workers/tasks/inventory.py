import logging
from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.services.checkout import release_expired_reservations

logger = logging.getLogger(__name__)

@celery_app.task(name="inventory.release_expired_reservations")
def release_expired_reservations_task():
    """Document 02 Section 12, Document 01 INV-004:
    Periodic 1-minute Celery task to clean up expired checkout inventory reservations.
    """
    logger.info("[INVENTORY TASK] Running release_expired_reservations...")
    db = SessionLocal()
    try:
        count = release_expired_reservations(db)
        logger.info(f"[INVENTORY TASK] Released {count} expired reservations")
        return count
    except Exception as e:
        logger.error(f"[INVENTORY TASK] Error releasing reservations: {e}")
        db.rollback()
        raise e
    finally:
        db.close()
