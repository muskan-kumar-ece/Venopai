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
