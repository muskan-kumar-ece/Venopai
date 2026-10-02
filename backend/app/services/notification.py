"""Notification service managing database persistence and Celery async dispatch.
Conforms to Document 01 §17, Document 02 §17, Document 04 §36, Document 05 §4.
"""
import uuid
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.engagement import Notification

logger = logging.getLogger(__name__)


def utcnow():
    return datetime.now(timezone.utc)


class NotificationService:
    @staticmethod
    def create_notification(
        db: Session,
        user_id: uuid.UUID,
        title: str,
        message: str,
        event_type: str = "general",
        idempotency_key: Optional[str] = None,
    ) -> Optional[Notification]:
        """Creates an auditable notification record and enqueues Celery delivery."""
        try:
            if idempotency_key:
                existing = db.query(Notification).filter(Notification.idempotency_key == idempotency_key).first()
                if existing:
                    logger.info(f"[NOTIF SERVICE] Duplicate notification prevented by idempotency key: {idempotency_key}")
                    return existing

            notification = Notification(
                user_id=user_id,
                title=title,
                message=message,
                event_type=event_type,
                status="pending",
                idempotency_key=idempotency_key,
                created_at=utcnow(),
            )
            db.add(notification)
            db.commit()
            db.refresh(notification)

            # Enqueue asynchronous email task via Celery
            try:
                from app.workers.tasks.notification import send_notification_email_task
                send_notification_email_task.delay(str(notification.id))
            except Exception as task_err:
                logger.warning(f"[NOTIF SERVICE] Celery dispatch skipped or failed: {task_err}")

            return notification
        except Exception as e:
            logger.error(f"[NOTIF SERVICE] Failed to create notification: {e}")
            db.rollback()
            return None

    @staticmethod
    def notify(
        db: Session,
        event_type: str,
        user_id: uuid.UUID,
        title: str,
        message: str,
        idempotency_key: Optional[str] = None,
    ) -> Optional[Notification]:
        return NotificationService.create_notification(
            db=db,
            user_id=user_id,
            title=title,
            message=message,
            event_type=event_type,
            idempotency_key=idempotency_key,
        )

    @staticmethod
    def notify_order_confirmation(db: Session, user_id: uuid.UUID, order_number: str):
        return NotificationService.notify(
            db,
            event_type="order_confirmation",
            user_id=user_id,
            title="Order Confirmed",
            message=f"Your order {order_number} has been confirmed.",
            idempotency_key=f"order_confirmation:{order_number}",
        )

    @staticmethod
    def notify_payment_confirmation(db: Session, user_id: uuid.UUID, amount: str, payment_id: Optional[str] = None):
        return NotificationService.notify(
            db,
            event_type="payment_confirmation",
            user_id=user_id,
            title="Payment Successful",
            message=f"Your payment of {amount} was successful.",
            idempotency_key=f"payment_confirmation:{payment_id}" if payment_id else None,
        )

    @staticmethod
    def notify_payment_failure(db: Session, user_id: uuid.UUID, payment_id: Optional[str] = None):
        return NotificationService.notify(
            db,
            event_type="payment_failure",
            user_id=user_id,
            title="Payment Failed",
            message="Your recent payment attempt failed. Please try again.",
            idempotency_key=f"payment_failure:{payment_id}" if payment_id else None,
        )

    @staticmethod
    def notify_quote_issued(db: Session, user_id: uuid.UUID, quote_id: str):
        return NotificationService.notify(
            db,
            event_type="quote_issued",
            user_id=user_id,
            title="Quote Issued",
            message="A new engineering quotation is ready for your review.",
            idempotency_key=f"quote_issued:{quote_id}",
        )

    @staticmethod
    def notify_quote_revised(db: Session, user_id: uuid.UUID, quote_id: str, version: int = 1):
        return NotificationService.notify(
            db,
            event_type="quote_revised",
            user_id=user_id,
            title="Quote Revised",
            message=f"Quotation {quote_id} (Version {version}) has been revised.",
            idempotency_key=f"quote_revised:{quote_id}:v{version}",
        )

    @staticmethod
    def notify_quote_approved(db: Session, user_id: uuid.UUID, quote_id: str):
        return NotificationService.notify(
            db,
            event_type="quote_approved",
            user_id=user_id,
            title="Quote Approved",
            message="Your quotation has been approved successfully.",
            idempotency_key=f"quote_approved:{quote_id}",
        )

    @staticmethod
    def notify_quote_rejected(db: Session, user_id: uuid.UUID, quote_id: str):
        return NotificationService.notify(
            db,
            event_type="quote_rejected",
            user_id=user_id,
            title="Quote Rejected",
            message="You have rejected the quotation.",
            idempotency_key=f"quote_rejected:{quote_id}",
        )

    @staticmethod
    def notify_status_change(db: Session, user_id: uuid.UUID, request_type: str, new_status: str, ref_id: Optional[str] = None):
        return NotificationService.notify(
            db,
            event_type="status_change",
            user_id=user_id,
            title="Status Update",
            message=f"Your {request_type} is now: {new_status}.",
            idempotency_key=f"status_change:{ref_id}:{new_status}" if ref_id else None,
        )

    @staticmethod
    def notify_shipment_update(db: Session, user_id: uuid.UUID, tracking: str):
        return NotificationService.notify(
            db,
            event_type="shipment_update",
            user_id=user_id,
            title="Shipment Update",
            message=f"Your shipment status has been updated: {tracking}.",
            idempotency_key=f"shipment_update:{tracking}",
        )
