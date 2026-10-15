import hashlib
import hmac
import json
import logging
import threading
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Header, Depends, status as http_status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, DatabaseError, OperationalError

from app.api.deps import get_db
from app.core.config import settings
from app.core.exceptions import APIException
from app.integrations.razorpay import razorpay_provider
from app.models.order import ProcessedWebhookEvent, ShippingWebhookInbox
from app.workers.tasks.payment import process_razorpay_webhook_event
from app.workers.tasks.shipping import process_shiprocket_webhook_task
from app.services.shipping import ShippingService

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
    # 1. Payload size check & bounded stream before buffering (bound to 1MB max)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > 1048576:
                raise APIException(
                    status_code=http_status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    code="PAYLOAD_TOO_LARGE",
                    message="Webhook payload exceeds maximum size limit of 1MB",
                )
        except ValueError:
            pass

    body_chunks = []
    total_size = 0
    async for chunk in request.stream():
        total_size += len(chunk)
        if total_size > 1048576:
            raise APIException(
                status_code=http_status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                code="PAYLOAD_TOO_LARGE",
                message="Webhook payload exceeds maximum size limit of 1MB",
            )
        body_chunks.append(chunk)
    body_bytes = b"".join(body_chunks)

    # 2. HMAC signature verification on raw body (SEC-004)
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
    x_api_key: str = Header(None, alias="x-api-key"),
    db: Session = Depends(get_db),
):
    """Doc 04 §20 (WEBHOOK-API-002): Durable Shiprocket tracking events, timing-safe auth, bounded size, deduplication, and asynchronous Celery dispatch."""
    # 1. Payload size check before buffering large payloads (bound to 1MB max)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > 1048576:
                raise APIException(
                    status_code=http_status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    code="PAYLOAD_TOO_LARGE",
                    message="Webhook payload exceeds maximum size limit of 1MB",
                )
        except ValueError:
            pass

    # 2. Authenticate token timing-safely across supported headers and query param (SEC-004)
    configured_token = settings.SHIPROCKET_WEBHOOK_TOKEN
    received_token = x_shiprocket_token or x_api_key or request.query_params.get("token")
    
    if configured_token or settings.ENVIRONMENT == "production":
        is_valid = False
        if received_token and configured_token:
            is_valid = hmac.compare_digest(received_token.strip(), configured_token.strip())
        if not is_valid:
            logger.warning("Shiprocket webhook authentication failed: token missing, invalid, or mismatched")
            raise APIException(
                status_code=http_status.HTTP_401_UNAUTHORIZED,
                code="UNAUTHORIZED_WEBHOOK",
                message="Invalid or missing Shiprocket webhook token",
            )

    # 3. Stream body with strictly enforced 1MB limit to protect against chunked memory exhaustion
    body_chunks = []
    total_size = 0
    async for chunk in request.stream():
        total_size += len(chunk)
        if total_size > 1048576:
            raise APIException(
                status_code=http_status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                code="PAYLOAD_TOO_LARGE",
                message="Webhook payload exceeds maximum size limit of 1MB",
            )
        body_chunks.append(chunk)
    body_bytes = b"".join(body_chunks)

    try:
        payload = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
    except Exception as e:
        logger.error(f"Failed to parse JSON body from Shiprocket webhook: {e}")
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_JSON",
            message="Malformed webhook JSON payload",
        )

    # 3. Deterministic event identification & composite hash deduplication
    raw_event_id = payload.get("event_id") or payload.get("id")
    awb = payload.get("awb") or payload.get("tracking_number") or ""
    current_status = payload.get("current_status") or payload.get("status") or "unknown"
    order_id_val = str(payload.get("order_id") or payload.get("shipment_id") or "")
    current_ts = str(payload.get("current_timestamp") or payload.get("occurred_at") or "")

    if raw_event_id:
        event_id = str(raw_event_id)
    else:
        hash_seed = f"{awb}:{current_status}:{current_ts}:{order_id_val}".encode("utf-8")
        event_id = f"sr_{hashlib.sha256(hash_seed).hexdigest()[:24]}"

    # 4. Atomic storage in ShippingWebhookInbox for durable persistence
    now = datetime.now(timezone.utc)
    inbox_record = None

    with _webhook_lock:
        existing_inbox = db.query(ShippingWebhookInbox).filter(
            ShippingWebhookInbox.event_id == event_id
        ).first()
        if existing_inbox:
            logger.info(f"Duplicate Shiprocket webhook event received: {event_id}. Returning 200.")
            return {"status": "duplicate_ignored", "event_id": event_id}

        inbox_record = ShippingWebhookInbox(
            id=uuid.uuid4(),
            event_id=event_id,
            provider="shiprocket",
            event_type=f"shipment.{current_status}",
            payload_json=body_bytes.decode("utf-8") if body_bytes else "{}",
            status="pending",
            attempts=0,
            received_at=now,
        )
        try:
            db.add(inbox_record)
            db.commit()
            db.refresh(inbox_record)
        except (IntegrityError, DatabaseError, OperationalError):
            db.rollback()
            logger.info(f"Duplicate Shiprocket webhook caught by database constraint: {event_id}. Returning 200.")
            return {"status": "duplicate_ignored", "event_id": event_id}

    # 5. Asynchronous Celery dispatch (with synchronous fallback)
    inbox_id_str = str(inbox_record.id)
    try:
        process_shiprocket_webhook_task.delay(inbox_id_str)
    except Exception as ce:
        logger.warning(f"Celery dispatch failed or running in test mode: {ce}. Executing synchronous fallback.")
        try:
            ShippingService.process_webhook_inbox_event(db, inbox_id_str)
        except Exception as se:
            logger.error(f"Synchronous fallback processing failed for inbox {inbox_id_str}: {se}")

    return {"status": "accepted", "event_id": event_id}


