"""Celery tasks for asynchronous email notification dispatch and retry sweep.
Conforms to Document 01 §17, Document 02 §17 & §19, Document 04 §36.
"""
import logging
from datetime import datetime, timezone
from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.engagement import Notification
from app.models.user import User
from app.integrations.resend import resend_provider

logger = logging.getLogger(__name__)


def utcnow():
    return datetime.now(timezone.utc)


@celery_app.task(bind=True, name="notifications.send_notification_email", max_retries=3, default_retry_delay=60)
def send_notification_email_task(self, notification_id: str):
    """Asynchronously dispatches a notification via Resend with delivery state tracking and backoff."""
    import uuid
    logger.info(f"[NOTIF TASK] Processing notification: {notification_id}")
    db = SessionLocal()
    try:
        try:
            nid = uuid.UUID(str(notification_id))
        except Exception:
            nid = notification_id
        notification = db.query(Notification).filter(Notification.id == nid).first()
        if not notification:
            logger.warning(f"[NOTIF TASK] Notification {notification_id} not found")
            return {"status": "not_found"}

        if notification.status == "sent":
            logger.info(f"[NOTIF TASK] Notification {notification_id} already sent, skipping")
            return {"status": "already_sent"}

        user = db.query(User).filter(User.id == notification.user_id).first()
        if not user or not user.email:
            notification.status = "failed"
            notification.failure_reason = "Recipient user or email missing"
            db.commit()
            return False

        try:
            html_body = f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #0f172a;">{notification.title}</h2>
                <p style="color: #334155; font-size: 16px; line-height: 1.5;">{notification.message}</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                <p style="color: #64748b; font-size: 12px;">VenopAI Engineering Realization Platform</p>
            </div>
            """
            res = resend_provider.send(
                to=user.email,
                subject=notification.title,
                html_body=html_body,
                text_body=notification.message,
            )
            notification.status = "sent"
            notification.sent_at = utcnow()
            notification.failure_reason = None
            db.commit()
            logger.info(f"[NOTIF TASK] Notification {notification_id} successfully sent to {user.email}")
            return True
        except Exception as exc:
            notification.retry_count = (notification.retry_count or 0) + 1
            notification.failure_reason = str(exc)[:500]
            notification.status = "failed"
            db.commit()
            logger.error(f"[NOTIF TASK] Notification {notification_id} attempt {notification.retry_count} failed: {exc}")
            countdown = 60 * (2 ** (self.request.retries or 0))
            raise self.retry(exc=exc, countdown=countdown)
    finally:
        db.close()


@celery_app.task(name="notifications.retry_failed_notifications")
def retry_failed_notifications():
    """Periodic Celery Beat sweep task: retries eligible failed notifications (Document 02 §19)."""
    logger.info("[NOTIF SWEEP] Checking for failed notifications eligible for retry...")
    db = SessionLocal()
    count = 0
    try:
        failed_notifs = db.query(Notification).filter(
            Notification.status == "failed",
            Notification.retry_count < 3,
        ).limit(50).all()

        for notif in failed_notifs:
            send_notification_email_task.delay(str(notif.id))
            count += 1

        logger.info(f"[NOTIF SWEEP] Scheduled {count} failed notifications for retry")
        return count
    finally:
        db.close()
