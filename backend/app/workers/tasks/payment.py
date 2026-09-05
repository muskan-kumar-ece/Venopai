import uuid
import json
import logging
from datetime import datetime, timezone, timedelta
from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.order import Payment, ProcessedWebhookEvent
from app.services.payment import PaymentService

logger = logging.getLogger("venopai.workers.tasks.payment")

@celery_app.task(name="payment.process_razorpay_webhook_event", bind=True, max_retries=3, default_retry_delay=60)
def process_razorpay_webhook_event(self, payload: dict):
    """Section 11: Celery asynchronous processing of verified Razorpay webhook events."""
    db = SessionLocal()
    try:
        event = payload.get("event")
        event_id = payload.get("event_id") or payload.get("id") or str(uuid.uuid4())

        logger.info(f"Processing Razorpay webhook event: {event} (ID: {event_id})")

        # 1. Extract entities
        payload_data = payload.get("payload", {})
        payment_entity = payload_data.get("payment", {}).get("entity", {})
        refund_entity = payload_data.get("refund", {}).get("entity", {})

        # 3. Handle payment captured / order paid
        if event in ("payment.captured", "order.paid"):
            razorpay_payment_id = payment_entity.get("id")
            razorpay_order_id = payment_entity.get("order_id")

            # Look up payment by razorpay_order_id or razorpay_payment_id
            payment = None
            if razorpay_order_id:
                payment = db.query(Payment).filter(Payment.razorpay_order_id == razorpay_order_id).first()
            if not payment and razorpay_payment_id:
                payment = db.query(Payment).filter(Payment.razorpay_payment_id == razorpay_payment_id).first()

            if payment:
                logger.info(f"Transitioning Payment {payment.id} to successful via webhook")
                PaymentService.mark_successful(
                    db=db,
                    payment_id=payment.id,
                    gateway_payment_id=razorpay_payment_id,
                    gateway_order_id=razorpay_order_id,
                    source="webhook",
                )

        # 4. Handle payment failed
        elif event == "payment.failed":
            razorpay_order_id = payment_entity.get("order_id")
            razorpay_payment_id = payment_entity.get("id")
            payment = None
            if razorpay_order_id:
                payment = db.query(Payment).filter(Payment.razorpay_order_id == razorpay_order_id).first()
            if not payment and razorpay_payment_id:
                payment = db.query(Payment).filter(Payment.razorpay_payment_id == razorpay_payment_id).first()

            if payment:
                logger.info(f"Transitioning Payment {payment.id} to failed via webhook")
                PaymentService.mark_failed(
                    db=db,
                    payment_id=payment.id,
                    error_code=payment_entity.get("error_code"),
                    error_description=payment_entity.get("error_description"),
                    source="webhook",
                )

        # 5. Handle refund processed
        elif event == "refund.processed":
            razorpay_refund_id = refund_entity.get("id")
            razorpay_payment_id = refund_entity.get("payment_id")
            payment = None
            if razorpay_payment_id:
                payment = db.query(Payment).filter(Payment.razorpay_payment_id == razorpay_payment_id).first()

            if payment:
                logger.info(f"Transitioning Payment {payment.id} to refunded via webhook")
                PaymentService.mark_refunded(
                    db=db,
                    payment_id=payment.id,
                    refund_gateway_id=razorpay_refund_id,
                    source="webhook",
                )

        # 6. Update or record processed event for durable deduplication
        event_record = db.query(ProcessedWebhookEvent).filter(
            ProcessedWebhookEvent.event_id == event_id
        ).first()
        if event_record:
            event_record.processed_at = datetime.now(timezone.utc)
            db.commit()
        else:
            try:
                processed = ProcessedWebhookEvent(
                    id=uuid.uuid4(),
                    event_id=event_id,
                    event_type=event or "unknown",
                    provider="razorpay",
                    payload=json.dumps(payload),
                    processed_at=datetime.now(timezone.utc),
                )
                db.add(processed)
                db.commit()
            except Exception:
                db.rollback()

        return {"status": "processed", "event_id": event_id}

    except Exception as exc:
        db.rollback()
        logger.error(f"Error processing webhook event: {exc}", exc_info=True)
        raise self.retry(exc=exc)
    finally:
        db.close()


@celery_app.task(name="payment.reconcile_pending_payments")
def reconcile_pending_payments():
    """Section 22: Background reconciliation task for stale pending payments."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        threshold = now - timedelta(minutes=30)

        stale_payments = (
            db.query(Payment)
            .filter(
                Payment.status == "pending",
                Payment.created_at < threshold,
            )
            .limit(50)
            .all()
        )

        reconciled_count = 0
        for p in stale_payments:
            # If session is expired and no payment arrived, mark failed
            if p.checkout_session and p.checkout_session.status in ("expired", "completed"):
                p.status = "failed"
                p.error_description = "Reconciled: Checkout session expired without confirmation"
                reconciled_count += 1

        db.commit()
        logger.info(f"Reconciled {reconciled_count} stale pending payments")
        return reconciled_count
    finally:
        db.close()
