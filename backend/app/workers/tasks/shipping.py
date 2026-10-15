"""Celery tasks for active shipment synchronization with Shiprocket.
Conforms to Document 01 §17, Document 02 §15 & §19, Document 04 §19 & §20.
"""
import logging
import threading
from datetime import datetime, timezone, timedelta
from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.order import Shipment, Order
from app.models.project import ManufacturingRequest
from app.integrations.shiprocket.client import shiprocket_provider
from app.services.notification import NotificationService
from app.core.rate_limit import get_redis_client

logger = logging.getLogger(__name__)
_sync_lock = threading.Lock()


def utcnow():
    return datetime.now(timezone.utc)


@celery_app.task(bind=True, name="shipping.process_shiprocket_webhook", max_retries=3, default_retry_delay=30)
def process_shiprocket_webhook_task(self, inbox_id: str):
    """Asynchronously processes a durable Shiprocket webhook inbox event (Phase 5)."""
    logger.info(f"[WEBHOOK WORKER] Processing shipping webhook inbox {inbox_id}")
    db = SessionLocal()
    try:
        from app.services.shipping import ShippingService
        return ShippingService.process_webhook_inbox_event(db=db, inbox_id=inbox_id)
    except Exception as exc:
        logger.error(f"[WEBHOOK WORKER] Failed processing inbox {inbox_id}: {exc}")
        raise self.retry(exc=exc)
    finally:
        db.close()


@celery_app.task(name="shipping.sync_active_shipments")
def sync_active_shipments_task():
    """Periodic Celery Beat task: polls tracking status for active shipments not yet delivered (Doc 02 §19).
    
    Hardened with:
    - Distributed locking to prevent concurrent overlapping runs.
    - Exclusion of terminal statuses (delivered, cancelled, returned).
    - Exclusion of shipments lacking tracking numbers.
    - Throttling (skipping shipments synced within the last 15 minutes).
    - Monotonic state machine enforcement via ShippingService.
    - Auto-reconciliation of uncertain bookings.
    """
    logger.info("[SHIPMENT SYNC] Polling Shiprocket tracking for active shipments...")
    
    # 1. Distributed concurrency lock (Redis or thread-safe fallback)
    lock_key = "lock:shipping:sync_active_shipments"
    redis_client = get_redis_client()
    lock_acquired = False
    
    if redis_client:
        try:
            lock_acquired = bool(redis_client.set(lock_key, "locked", nx=True, ex=300))
            if not lock_acquired:
                logger.info("[SHIPMENT SYNC] Another shipment sync task is currently active. Skipping overlapping run.")
                return 0
        except Exception as e:
            logger.debug(f"[SHIPMENT SYNC] Redis lock acquisition error: {e}. Falling back to in-memory lock.")
            lock_acquired = _sync_lock.acquire(blocking=False)
            if not lock_acquired:
                logger.info("[SHIPMENT SYNC] In-memory lock held. Skipping overlapping run.")
                return 0
    else:
        lock_acquired = _sync_lock.acquire(blocking=False)
        if not lock_acquired:
            logger.info("[SHIPMENT SYNC] In-memory lock held. Skipping overlapping run.")
            return 0

    db = SessionLocal()
    synced_count = 0
    try:
        now = utcnow()
        sync_threshold = now - timedelta(minutes=15)

        # 2. Query active, non-terminal shipments with AWB assigned
        terminal_states = ["delivered", "cancelled", "returned", "rto_delivered"]
        active_shipments = db.query(Shipment).filter(
            Shipment.status.notin_(terminal_states),
            Shipment.tracking_number.isnot(None),
            (Shipment.last_tracking_synced_at.is_(None)) | (Shipment.last_tracking_synced_at < sync_threshold)
        ).order_by(Shipment.last_tracking_synced_at.asc().nullsfirst()).limit(50).all()

        from app.services.shipping import ShippingService

        for shipment in active_shipments:
            try:
                ShippingService.sync_shipment_tracking(db=db, shipment_id=str(shipment.id))
                synced_count += 1
            except Exception as e:
                logger.error(f"[SHIPMENT SYNC] Tracking sync failed for shipment {shipment.id}: {e}")
                db.rollback()

        # 3. Auto-reconcile uncertain bookings
        unreconciled_shipments = db.query(Shipment).filter(
            Shipment.booking_status.in_(["reconciliation_required", "awb_pending"]),
            Shipment.shiprocket_order_id.isnot(None),
        ).limit(20).all()

        for s in unreconciled_shipments:
            try:
                ShippingService.reconcile_shipment(db, str(s.id))
            except Exception as re:
                logger.error(f"[SHIPMENT SYNC] Auto-reconciliation failed for shipment {s.id}: {re}")

        logger.info(f"[SHIPMENT SYNC] Completed sync across {synced_count} active shipments")
        return synced_count
    finally:
        db.close()
        # Release lock
        if redis_client:
            try:
                redis_client.delete(lock_key)
            except Exception:
                pass
        else:
            try:
                _sync_lock.release()
            except RuntimeError:
                pass



@celery_app.task(bind=True, name="shipping.async_generate_label", max_retries=3, default_retry_delay=60)
def async_generate_label_task(self, shipment_id: str):
    """Async background task to generate shipping label with bounded retries."""
    db = SessionLocal()
    try:
        from app.services.shipping import ShippingService
        return ShippingService.get_or_generate_label(db=db, shipment_id=shipment_id)
    except Exception as exc:
        logger.error(f"[ASYNC LABEL] Failed for {shipment_id}: {exc}")
        raise self.retry(exc=exc)
    finally:
        db.close()


@celery_app.task(bind=True, name="shipping.async_schedule_pickup", max_retries=3, default_retry_delay=60)
def async_schedule_pickup_task(self, shipment_id: str, pickup_date: str = None):
    """Async background task to schedule courier pickup with bounded retries."""
    db = SessionLocal()
    try:
        from app.services.shipping import ShippingService
        return ShippingService.schedule_shipment_pickup(db=db, shipment_id=shipment_id, pickup_date=pickup_date)
    except Exception as exc:
        logger.error(f"[ASYNC PICKUP] Failed for {shipment_id}: {exc}")
        raise self.retry(exc=exc)
    finally:
        db.close()

