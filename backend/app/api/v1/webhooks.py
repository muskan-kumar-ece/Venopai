import uuid
import json
import logging
import threading
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Header, Depends, status as http_status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, DatabaseError, OperationalError

from app.api.deps import get_db
from app.core.exceptions import APIException
from app.integrations.razorpay import razorpay_provider
from app.models.order import ProcessedWebhookEvent
from app.workers.tasks.payment import process_razorpay_webhook_event

logger = logging.getLogger("venopai.api.webhooks")
router = APIRouter()
_webhook_lock = threading.Lock()

@router.post(
    "/razorpay",
    status_code=http_status.HTTP_200_OK,
    summary="WEBHOOK-API-001: Razorpay server-to-server webhook endpoint",
)
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(None, alias="X-Razorpay-Signature"),
    db: Session = Depends(get_db),
):
    """Sections 9, 10, 11: Webhook HMAC verification, deduplication, and asynchronous Celery dispatch."""
    body_bytes = await request.body()

    # 1. HMAC signature verification on raw body (SEC-004)
    if not x_razorpay_signature or not razorpay_provider.verify_webhook_signature(body_bytes, x_razorpay_signature):
        logger.warning("Razorpay webhook signature verification failed")
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_SIGNATURE",
            message="Invalid webhook signature",
        )

    # 2. Parse payload safely only after verification
    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except Exception as e:
        logger.error(f"Failed to parse JSON body from verified webhook: {e}")
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_JSON",
            message="Malformed webhook JSON payload",
        )

    # 3. Atomic event deduplication by event ID (PAY-004)
    # Combines fast-path check with atomic DB unique constraint for race-free deduplication
    event_id = payload.get("event_id") or payload.get("id") or request.headers.get("x-razorpay-event-id")
    if not event_id:
        event_id = f"evt_{uuid.uuid4().hex}"
    payload["event_id"] = event_id
    # Fast-path check & atomic reservation
    with _webhook_lock:
        existing = db.query(ProcessedWebhookEvent).filter(
            ProcessedWebhookEvent.event_id == event_id
        ).first()
        if existing:
            logger.info(f"Duplicate Razorpay webhook event received (fast-path): {event_id}. Returning 200.")
            return {"status": "duplicate_ignored"}

        # Atomic reservation in DB (handles concurrent race condition where both pass fast-path)
        processed_entry = ProcessedWebhookEvent(
            id=uuid.uuid4(),
            event_id=event_id,
            event_type=payload.get("event") or "unknown",
            provider="razorpay",
            payload=body_bytes.decode("utf-8"),
            processed_at=datetime.now(timezone.utc),
        )
        try:
            db.add(processed_entry)
            db.commit()
        except (IntegrityError, DatabaseError, OperationalError):
            db.rollback()
            logger.info(f"Duplicate Razorpay webhook event received (atomic unique constraint / concurrency collision): {event_id}. Returning 200.")
            return {"status": "duplicate_ignored"}

    # 4. Asynchronous Celery dispatch (dispatched ONLY if atomic INSERT succeeded)
    process_razorpay_webhook_event.delay(payload)

    return {"status": "accepted"}


@router.post(
    "/shiprocket",
    status_code=http_status.HTTP_200_OK,
    summary="WEBHOOK-API-002: Shiprocket tracking status webhook endpoint",
)
async def shiprocket_webhook(
    request: Request,
    x_shiprocket_token: str = Header(None, alias="X-Shiprocket-Token"),
    db: Session = Depends(get_db),
):
    """Doc 04 §20 (WEBHOOK-API-002): Shiprocket tracking events, deduplication, shipment updates, and notification."""
    # Authenticate Shiprocket webhook request (SEC-004)
    from app.core.config import settings
    configured_token = settings.SHIPROCKET_WEBHOOK_TOKEN
    if configured_token or settings.ENVIRONMENT == "production":
        if not x_shiprocket_token or x_shiprocket_token != configured_token:
            logger.warning("Shiprocket webhook authentication failed: token missing or invalid")
            raise APIException(
                status_code=http_status.HTTP_401_UNAUTHORIZED,
                code="UNAUTHORIZED_WEBHOOK",
                message="Invalid or missing Shiprocket webhook token",
            )

    body_bytes = await request.body()
    try:
        payload = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
    except Exception as e:
        logger.error(f"Failed to parse JSON body from Shiprocket webhook: {e}")
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_JSON",
            message="Malformed webhook JSON payload",
        )

    # Event identification & deduplication
    awb = payload.get("awb") or payload.get("tracking_number") or ""
    current_status = payload.get("current_status") or payload.get("status") or "unknown"
    event_id = payload.get("event_id") or f"sr_{awb}_{current_status}"

    with _webhook_lock:
        existing = db.query(ProcessedWebhookEvent).filter(
            ProcessedWebhookEvent.event_id == event_id
        ).first()
        if existing:
            logger.info(f"Duplicate Shiprocket webhook event received: {event_id}. Returning 200.")
            return {"status": "duplicate_ignored"}

        processed_entry = ProcessedWebhookEvent(
            id=uuid.uuid4(),
            event_id=event_id,
            event_type=f"shipment.{current_status}",
            provider="shiprocket",
            payload=body_bytes.decode("utf-8") if body_bytes else "",
            processed_at=datetime.now(timezone.utc),
        )
        try:
            db.add(processed_entry)
            db.commit()
        except (IntegrityError, DatabaseError, OperationalError):
            db.rollback()
            return {"status": "duplicate_ignored"}

    # Process shipment status transition
    from app.models.order import Shipment, Order
    from app.models.project import ManufacturingRequest
    from app.services.notification import NotificationService

    # Map Shiprocket status to VenopAI normalized vocabulary
    raw_status = current_status.upper()
    if "DELIVERED" in raw_status:
        normalized_status = "delivered"
    elif "OUT FOR DELIVERY" in raw_status:
        normalized_status = "out_for_delivery"
    elif any(k in raw_status for k in ["IN TRANSIT", "SHIPPED", "PICKED UP"]):
        normalized_status = "in_transit"
    elif "CANCEL" in raw_status:
        normalized_status = "cancelled"
    elif "RETURN" in raw_status or "RTO" in raw_status:
        normalized_status = "returned"
    else:
        normalized_status = "in_transit"

    shipment = None
    if awb:
        shipment = db.query(Shipment).filter(Shipment.tracking_number == awb).first()
    if not shipment and payload.get("order_id"):
        shipment = db.query(Shipment).filter(Shipment.shiprocket_order_id == str(payload["order_id"])).first()

    if shipment:
        shipment.status = normalized_status
        if payload.get("courier_name"):
            shipment.carrier = payload["courier_name"]
        if payload.get("etd"):
            try:
                shipment.estimated_delivery = datetime.fromisoformat(payload["etd"])
            except Exception:
                pass
        shipment.updated_at = datetime.now(timezone.utc)

        # Transition parent entity if delivered
        if normalized_status == "delivered":
            if shipment.order_id:
                order = db.query(Order).filter(Order.id == shipment.order_id).first()
                if order and order.status != "delivered":
                    order.status = "delivered"
                    order.updated_at = datetime.now(timezone.utc)
                    NotificationService.notify_status_change(db, order.user_id, "Order", "delivered")
            elif shipment.manufacturing_request_id:
                mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == shipment.manufacturing_request_id).first()
                if mfg and mfg.status != "delivered":
                    mfg.status = "delivered"
                    mfg.updated_at = datetime.now(timezone.utc)
                    NotificationService.notify_status_change(db, mfg.user_id, "Manufacturing Request", "delivered")
        else:
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
                NotificationService.notify_shipment_update(db, user_id, f"{shipment.tracking_number} ({normalized_status})")

        db.commit()

    return {"status": "accepted"}

