"""Celery tasks for quotation lifecycle maintenance and expiration sweep.
Conforms to Document 01 §11 (QUOTE-002), Document 02 §19.
"""
import logging
from datetime import datetime, timezone
from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.project import Quote, QuoteVersion

logger = logging.getLogger(__name__)


def utcnow():
    return datetime.now(timezone.utc)


@celery_app.task(name="quotes.expire_quotes")
def expire_quotes_task():
    """Periodic Celery Beat task: expires quote versions and quotes past valid_until (Doc 02 §19)."""
    logger.info("[QUOTE EXPIRY] Checking for expired quotes...")
    db = SessionLocal()
    expired_count = 0
    try:
        now = utcnow()
        # Find active quote versions past valid_until
        expired_versions = db.query(QuoteVersion).filter(
            QuoteVersion.status.in_(["sent", "viewed"]),
            QuoteVersion.valid_until.isnot(None),
            QuoteVersion.valid_until < now,
        ).all()

        for version in expired_versions:
            logger.info(f"[QUOTE EXPIRY] Expiring QuoteVersion {version.id} (valid until {version.valid_until})")
            version.status = "expired"
            
            # Check parent quote
            quote = db.query(Quote).filter(Quote.id == version.quote_id).first()
            if quote and quote.status in ["sent", "viewed"]:
                # Check if there are any other active/valid versions
                other_active = db.query(QuoteVersion).filter(
                    QuoteVersion.quote_id == quote.id,
                    QuoteVersion.id != version.id,
                    QuoteVersion.status.in_(["sent", "viewed"]),
                    (QuoteVersion.valid_until.is_(None) | (QuoteVersion.valid_until >= now)),
                ).count()
                if other_active == 0:
                    logger.info(f"[QUOTE EXPIRY] Expiring parent Quote {quote.id}")
                    quote.status = "expired"
                    quote.updated_at = now

            db.commit()
            expired_count += 1

        logger.info(f"[QUOTE EXPIRY] Expired {expired_count} quote versions")
        return expired_count
    finally:
        db.close()
