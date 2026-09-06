import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.engagement import Notification

logger = logging.getLogger(__name__)

class NotificationService:
    @staticmethod
    def create_notification(db: Session, user_id: uuid.UUID, title: str, message: str) -> Notification:
        try:
            notification = Notification(
                user_id=user_id,
                title=title,
                message=message,
                created_at=datetime.now(timezone.utc)
            )
            db.add(notification)
            db.commit()
            db.refresh(notification)
            return notification
        except Exception as e:
            logger.error(f"Failed to create notification: {e}")
            db.rollback()
            return None

    @staticmethod
    def notify_order_confirmation(db: Session, user_id: uuid.UUID, order_number: str):
        return NotificationService.create_notification(db, user_id, "Order Confirmed", f"Your order {order_number} has been confirmed.")

    @staticmethod
    def notify_payment_confirmation(db: Session, user_id: uuid.UUID, amount: str):
        return NotificationService.create_notification(db, user_id, "Payment Successful", f"Your payment of {amount} was successful.")

    @staticmethod
    def notify_payment_failure(db: Session, user_id: uuid.UUID):
        return NotificationService.create_notification(db, user_id, "Payment Failed", "Your recent payment attempt failed.")

    @staticmethod
    def notify_quote_issued(db: Session, user_id: uuid.UUID, quote_id: str):
        return NotificationService.create_notification(db, user_id, "Quote Issued", f"A new quote is ready for your review.")

    @staticmethod
    def notify_quote_revised(db: Session, user_id: uuid.UUID, quote_id: str):
        return NotificationService.create_notification(db, user_id, "Quote Revised", f"Your quote has been revised.")

    @staticmethod
    def notify_quote_approved(db: Session, user_id: uuid.UUID, quote_id: str):
        return NotificationService.create_notification(db, user_id, "Quote Approved", f"Your quote has been approved successfully.")

    @staticmethod
    def notify_quote_rejected(db: Session, user_id: uuid.UUID, quote_id: str):
        return NotificationService.create_notification(db, user_id, "Quote Rejected", f"You have rejected the quote.")

    @staticmethod
    def notify_status_change(db: Session, user_id: uuid.UUID, request_type: str, new_status: str):
        return NotificationService.create_notification(db, user_id, "Status Update", f"Your {request_type} is now: {new_status}.")

    @staticmethod
    def notify_shipment_update(db: Session, user_id: uuid.UUID, tracking: str):
        return NotificationService.create_notification(db, user_id, "Shipment Update", f"Your shipment tracking has been updated: {tracking}.")
