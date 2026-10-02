"""Celery tasks for active shipment synchronization with Shiprocket.
Conforms to Document 01 §17, Document 02 §15 & §19, Document 04 §19 & §20.
"""
import logging
from datetime import datetime, timezone
from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.order import Shipment, Order
from app.models.project import ManufacturingRequest
from app.integrations.shiprocket.client import shiprocket_provider
from app.services.notification import NotificationService

logger = logging.getLogger(__name__)


def utcnow():
    return datetime.now(timezone.utc)


@celery_app.task(name="shipping.sync_active_shipments")
def sync_active_shipments_task():
    """Periodic Celery Beat task: polls tracking status for active shipments not yet delivered (Doc 02 §19)."""
    logger.info("[SHIPMENT SYNC] Polling Shiprocket tracking for active shipments...")
    db = SessionLocal()
    synced_count = 0
    try:
        active_shipments = db.query(Shipment).filter(
            Shipment.status.notin_(["delivered", "cancelled", "returned"]),
            Shipment.tracking_number.isnot(None),
        ).limit(100).all()

        for shipment in active_shipments:
            try:
                tracking_data = shiprocket_provider.get_tracking_status(shipment.tracking_number)
                new_status = tracking_data.get("status")
                carrier = tracking_data.get("carrier")
                eta = tracking_data.get("estimated_delivery")

                if carrier:
                    shipment.carrier = carrier
                if eta:
                    try:
                        shipment.estimated_delivery = datetime.fromisoformat(eta)
                    except Exception:
                        pass

                if new_status and new_status != shipment.status:
                    logger.info(f"[SHIPMENT SYNC] Shipment {shipment.id} transitioned from {shipment.status} to {new_status}")
                    shipment.status = new_status
                    shipment.updated_at = utcnow()

                    # Check parent order or request
                    if new_status == "delivered":
                        if shipment.order_id:
                            order = db.query(Order).filter(Order.id == shipment.order_id).first()
                            if order and order.status != "delivered":
                                order.status = "delivered"
                                order.updated_at = utcnow()
                                NotificationService.notify_status_change(db, order.user_id, "Order", "delivered")
                        elif shipment.manufacturing_request_id:
                            mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == shipment.manufacturing_request_id).first()
                            if mfg and mfg.status != "delivered":
                                mfg.status = "delivered"
                                mfg.updated_at = utcnow()
                                NotificationService.notify_status_change(db, mfg.user_id, "Manufacturing Request", "delivered")
                    else:
                        # Status notification
                        user_id = None
                        if shipment.order_id:
                            order = db.query(Order).filter(Order.id == shipment.order_id).first()
                            if order:
                                user_id = order.user_id
                        elif shipment.manufacturing_request_id:
                            mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == shipment.manufacturing_request_id).first()
                            if mfg:
                                user_id = mfg.user_id
                        if user_id:
                            NotificationService.notify_shipment_update(db, user_id, f"{shipment.tracking_number} ({new_status})")

                db.commit()
                synced_count += 1
            except Exception as e:
                logger.error(f"[SHIPMENT SYNC] Failed tracking sync for shipment {shipment.id}: {e}")
                db.rollback()

        logger.info(f"[SHIPMENT SYNC] Completed sync across {synced_count} shipments")
        return synced_count
    finally:
        db.close()
