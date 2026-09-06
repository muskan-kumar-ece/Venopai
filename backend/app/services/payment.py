import uuid
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import status as http_status

from app.core.config import settings
from app.core.exceptions import APIException
from app.models.user import User, Address, AuditEvent
from app.models.catalog import Product, Inventory, InventoryReservation
from app.models.order import Cart, CartItem, CheckoutSession, Order, OrderItem, Payment, Refund
from app.models.project import Project, Quote, QuoteVersion, QuoteApproval, ManufacturingRequest, DesignRequest, SoftwareRequest, ConsultationRequest
from app.integrations.razorpay import razorpay_provider
from app.services.catalog import _rupees, _paise

def utcnow():
    return datetime.now(timezone.utc)

def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

def generate_order_number(db: Session) -> str:
    """Generates unique order number matching Document 03 §18 (format: VENOPAI-YYYYMMDD-XXXX)."""
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = db.query(func.count(Order.id)).scalar() or 0
    suffix = f"{count + 1:04d}"
    candidate = f"VENOPAI-{today_str}-{suffix}"
    if db.query(Order).filter(Order.order_number == candidate).first():
        candidate = f"VENOPAI-{today_str}-{uuid.uuid4().hex[:4].upper()}"
    return candidate

import threading
_payment_initiation_lock = threading.Lock()


class PaymentService:
    """Centralized payment lifecycle & financial transition service (PAY-001 - PAY-005)."""

    @classmethod
    def initiate_payment(
        cls,
        db: Session,
        user: User,
        source_type: str,
        source_id: str,
    ) -> Dict[str, Any]:
        """PAYMENT-API-001: Register a payment intent for checkout session or approved quote.
        Guarantees idempotency: re-requesting for the same valid source returns existing pending intent.
        """
        # 1. Require verified customer (AUTH-001 / SEC-002)
        if user.status != "verified" and not getattr(user, "is_verified", False):
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="ACCOUNT_NOT_VERIFIED",
                message="Verified customer account required to initiate payment",
            )

        with _payment_initiation_lock:
            source_type_normalized = source_type.strip().lower()
            now = utcnow()

            # 2. Source-specific validation
            if source_type_normalized == "checkout_session":
                try:
                    s_uuid = uuid.UUID(source_id)
                except ValueError:
                    raise APIException(
                        status_code=http_status.HTTP_404_NOT_FOUND,
                        code="SESSION_NOT_FOUND",
                        message="Checkout session not found",
                    )

                session = db.query(CheckoutSession).filter(
                    CheckoutSession.id == s_uuid,
                    CheckoutSession.user_id == user.id,
                ).with_for_update().first()

                if not session:
                    raise APIException(
                        status_code=http_status.HTTP_404_NOT_FOUND,
                        code="SESSION_NOT_FOUND",
                        message="Checkout session not found or not owned by user",
                    )

                if session.status == "completed":
                    raise APIException(
                        status_code=http_status.HTTP_409_CONFLICT,
                        code="SESSION_ALREADY_COMPLETED",
                        message="This checkout session has already been completed",
                    )

                if session.status == "expired":
                    raise APIException(
                        status_code=http_status.HTTP_409_CONFLICT,
                        code="SESSION_EXPIRED",
                        message="Checkout session has expired",
                    )

                exp = _as_utc(session.reservation_expires_at)
                if exp and exp <= now:
                    session.status = "expired"
                    db.commit()
                    raise APIException(
                        status_code=http_status.HTTP_409_CONFLICT,
                        code="RESERVATION_EXPIRED",
                        message="Inventory reservation for this checkout session has expired",
                    )

                amount_paise = session.total_paise
                checkout_session_id = session.id
                quote_id = None

                # 3. Idempotency check: Look for existing pending payment for this checkout session
                existing_payment = db.query(Payment).filter(
                    Payment.checkout_session_id == session.id,
                    Payment.status == "pending",
                ).first()

            elif source_type_normalized == "quote":
                try:
                    q_uuid = uuid.UUID(source_id)
                except ValueError:
                    raise APIException(
                        status_code=http_status.HTTP_404_NOT_FOUND,
                        code="QUOTE_NOT_FOUND",
                        message="Quote not found",
                    )

                quote = db.query(Quote).join(Project).filter(
                    Quote.id == q_uuid,
                    Project.user_id == user.id,
                ).with_for_update().first()

                if not quote:
                    raise APIException(
                        status_code=http_status.HTTP_404_NOT_FOUND,
                        code="QUOTE_NOT_FOUND",
                        message="Quote not found or not owned by user",
                    )

                # Check latest quote version (QUOTE-001, PAY-005)
                latest_version = (
                    db.query(QuoteVersion)
                    .filter(QuoteVersion.quote_id == quote.id)
                    .order_by(QuoteVersion.version.desc())
                    .first()
                )

                if not latest_version:
                    raise APIException(
                        status_code=http_status.HTTP_409_CONFLICT,
                        code="QUOTE_NOT_APPROVED",
                        message="No valid quote version exists",
                    )

                # Check approval status
                approval = latest_version.approval
                is_approved = (approval and approval.status == "APPROVED") or (quote.status == "APPROVED")
                if not is_approved:
                    raise APIException(
                        status_code=http_status.HTTP_409_CONFLICT,
                        code="QUOTE_NOT_APPROVED",
                        message="Payment cannot be initiated until the quote is Approved by customer",
                    )

                if quote.status in ("SUPERSEDED", "EXPIRED", "REJECTED"):
                    raise APIException(
                        status_code=http_status.HTTP_409_CONFLICT,
                        code="QUOTE_SUPERSEDED",
                        message=f"Quote is in {quote.status} state and cannot accept payment",
                    )

                amount_paise = latest_version.total_amount
                checkout_session_id = None
                quote_id = quote.id

                # Idempotency check for quote
                existing_payment = db.query(Payment).filter(
                    Payment.quote_id == quote.id,
                    Payment.status == "pending",
                ).first()

            else:
                raise APIException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    code="INVALID_SOURCE_TYPE",
                    message="source_type must be 'checkout_session' or 'quote'",
                )

            # 4. If existing pending payment exists, return it (Idempotent reuse)
            if existing_payment:
                if not existing_payment.razorpay_order_id:
                    intent = razorpay_provider.create_payment_intent(
                        amount=amount_paise,
                        currency="INR",
                        reference=str(existing_payment.id),
                    )
                    existing_payment.razorpay_order_id = intent.id
                    db.commit()
                    db.refresh(existing_payment)

                return {
                    "payment_id": str(existing_payment.id),
                    "provider": "razorpay",
                    "razorpay_order_id": existing_payment.razorpay_order_id,
                    "gateway_order_id": existing_payment.razorpay_order_id,
                    "amount": _rupees(existing_payment.amount),
                    "amount_paise": existing_payment.amount,
                    "currency": existing_payment.currency,
                    "key_id": settings.RAZORPAY_KEY_ID or "rzp_test_mock_key",
                }

            # 5. Call RazorpayProvider to create gateway intent first
            payment_id = uuid.uuid4()
            intent = razorpay_provider.create_payment_intent(
                amount=amount_paise,
                currency="INR",
                reference=str(payment_id),
            )

            # 6. Create local Payment record with non-null razorpay_order_id in single atomic commit
            payment = Payment(
                id=payment_id,
                user_id=user.id,
                checkout_session_id=checkout_session_id,
                quote_id=quote_id,
                status="pending",
                amount=amount_paise,
                currency="INR",
                razorpay_order_id=intent.id,
                created_at=now,
            )
            db.add(payment)
            db.commit()
            db.refresh(payment)

            return {
                "payment_id": str(payment.id),
                "provider": "razorpay",
                "razorpay_order_id": payment.razorpay_order_id,
                "gateway_order_id": payment.razorpay_order_id,
                "amount": _rupees(payment.amount),
                "amount_paise": payment.amount,
                "currency": payment.currency,
                "key_id": intent.key_id or settings.RAZORPAY_KEY_ID or "rzp_test_mock_key",
            }

    @classmethod
    def confirm_payment(
        cls,
        db: Session,
        user: User,
        payment_id: str,
        razorpay_payment_id: str,
        razorpay_order_id: str,
        razorpay_signature: str,
    ) -> Dict[str, Any]:
        """PAYMENT-API-002: Frontend callback verification path."""
        try:
            p_uuid = uuid.UUID(payment_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="PAYMENT_NOT_FOUND",
                message="Payment not found",
            )

        payment = db.query(Payment).filter(
            Payment.id == p_uuid,
            Payment.user_id == user.id,
        ).first()

        if not payment:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="PAYMENT_NOT_FOUND",
                message="Payment record not found or not owned by user",
            )

        # Verify Razorpay order ID matches payment
        if payment.razorpay_order_id and payment.razorpay_order_id != razorpay_order_id:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="INVALID_PAYMENT_ORDER",
                message="Razorpay order ID mismatch",
            )

        # Server-side cryptographic signature verification (PAY-002)
        valid = razorpay_provider.verify_payment(
            payment_id=razorpay_payment_id,
            order_id=razorpay_order_id,
            signature=razorpay_signature,
        )
        if not valid:
            # Security Rule (SEC-PAY-001): Do NOT mutate payment.status to 'failed' on client signature mismatch.
            # Mutating to 'failed' would allow malicious/forged client confirmation requests to sabotage legitimate
            # pending payments. The payment remains 'pending' allowing legitimate retries or webhook confirmation.
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="INVALID_SIGNATURE",
                message="Cryptographic payment signature verification failed",
            )

        # Converge on centralized idempotent success transition
        order = cls.mark_successful(
            db=db,
            payment_id=payment.id,
            gateway_payment_id=razorpay_payment_id,
            gateway_order_id=razorpay_order_id,
            signature=razorpay_signature,
            source="confirm",
        )

        return {
            "payment_id": str(payment.id),
            "status": "successful",
            "order_id": str(order.id) if order else (str(payment.order_id) if payment.order_id else None),
            "order_number": order.order_number if order else (payment.order.order_number if payment.order else None),
        }

    @classmethod
    def mark_successful(
        cls,
        db: Session,
        payment_id: uuid.UUID,
        gateway_payment_id: str,
        gateway_order_id: Optional[str] = None,
        signature: Optional[str] = None,
        source: str = "system",
    ) -> Optional[Order]:
        """Sections 8, 12, 13, 14, 15: Single authoritative transactional payment success path.
        Guarantees race-condition safety between frontend confirm and webhook.
        """
        now = utcnow()

        # Row-level lock on Payment
        payment = (
            db.query(Payment)
            .filter(Payment.id == payment_id)
            .with_for_update()
            .first()
        )

        if not payment:
            return None

        # 1. Idempotency: If already successful, return linked order immediately
        if payment.status == "successful":
            if payment.order_id:
                return db.query(Order).filter(Order.id == payment.order_id).first()
            return None

        if payment.status == "failed":
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="PAYMENT_ALREADY_FAILED",
                message="Terminal failed payment cannot be transitioned to successful",
            )

        # 2. Transition Payment to successful
        payment.status = "successful"
        payment.razorpay_payment_id = gateway_payment_id
        if gateway_order_id:
            payment.razorpay_order_id = gateway_order_id
        if signature:
            payment.razorpay_signature = signature
        payment.confirmed_at = now

        order_result = None

        # 3. Commerce path: Create Order and finalize inventory (ORD-001, INV-005)
        if payment.checkout_session_id:
            session = (
                db.query(CheckoutSession)
                .filter(CheckoutSession.id == payment.checkout_session_id)
                .with_for_update()
                .first()
            )

            if session:
                session.status = "completed"

                order_number = generate_order_number(db)
                addr = session.address
                addr_snapshot = {}
                if addr:
                    addr_snapshot = {
                        "recipient_name": addr.recipient_name,
                        "phone": addr.phone,
                        "line1": addr.line1,
                        "line2": addr.line2,
                        "city": addr.city,
                        "state": addr.state,
                        "pincode": addr.pincode,
                        "country": addr.country,
                    }

                order_id = uuid.uuid4()
                order = Order(
                    id=order_id,
                    order_number=order_number,
                    user_id=session.user_id,
                    checkout_session_id=session.id,
                    status="paid",  # ORD-001: Starts at paid
                    subtotal_paise=session.subtotal_paise,
                    shipping_rate_paise=session.shipping_rate_paise,
                    tax_type=session.tax_type,
                    tax_amount_paise=session.tax_amount_paise,
                    cgst_amount_paise=session.cgst_amount_paise,
                    sgst_amount_paise=session.sgst_amount_paise,
                    igst_amount_paise=session.igst_amount_paise,
                    total_paise=session.total_paise,
                    total_amount=session.total_paise,
                    shipping_address_id=session.address_id,
                    shipping_address_snapshot=json.dumps(addr_snapshot),
                    paid_at=now,
                    created_at=now,
                )
                db.add(order)
                payment.order_id = order.id
                order_result = order

                # Create OrderItems snapshots from Cart
                if session.cart:
                    for it in session.cart.items:
                        prod = it.product
                        p_name = prod.name if prod else "Product"
                        p_price = prod.price_paise if prod else 0
                        order_item = OrderItem(
                            id=uuid.uuid4(),
                            order_id=order.id,
                            product_id=it.product_id,
                            product_name=p_name,
                            quantity=it.quantity,
                            price_at_time_of_order=p_price,
                            unit_price_paise=p_price,
                            total_paise=p_price * it.quantity,
                        )
                        db.add(order_item)

                # Finalize Inventory (INV-005): permanently decrement stock and consume reservation
                reservations = (
                    db.query(InventoryReservation)
                    .filter(
                        InventoryReservation.checkout_session_id == session.id,
                        InventoryReservation.status == "ACTIVE",
                    )
                    .all()
                )
                for res in reservations:
                    inv = (
                        db.query(Inventory)
                        .filter(Inventory.id == res.inventory_id)
                        .with_for_update()
                        .first()
                    )
                    if inv:
                        inv.stock_quantity = max(0, inv.stock_quantity - res.quantity)
                        inv.reserved_quantity = max(0, inv.reserved_quantity - res.quantity)

                    res.status = "CONSUMED"
                    res.order_id = order.id
                    res.released_at = now

                # Clear cart items
                db.query(CartItem).filter(CartItem.cart_id == session.cart_id).delete()

                # Record audit event
                audit = AuditEvent(
                    id=uuid.uuid4(),
                    user_id=payment.user_id,
                    action="COMMERCE_ORDER_PAID",
                    entity_type="Order",
                    entity_id=order.id,
                    details=json.dumps({
                        "order_number": order.order_number,
                        "payment_id": str(payment.id),
                        "total_paise": order.total_paise,
                    }),
                    created_at=now,
                )
                db.add(audit)

        # 4. Service Quote path: Unlock execution (Section 26)
        elif payment.quote_id:
            quote = (
                db.query(Quote)
                .filter(Quote.id == payment.quote_id)
                .with_for_update()
                .first()
            )
            if quote:
                quote.status = "approved"
                quote.updated_at = now

                # Unlock linked requests (by direct request_id or project_id)
                if getattr(quote, "request_id", None) and getattr(quote, "request_type", "") == "manufacturing":
                    db.query(ManufacturingRequest).filter(ManufacturingRequest.id == quote.request_id).update({"status": "in_progress"})
                elif getattr(quote, "request_id", None) and getattr(quote, "request_type", "") == "design":
                    db.query(DesignRequest).filter(DesignRequest.id == quote.request_id).update({"status": "in_progress"})
                elif getattr(quote, "request_id", None) and getattr(quote, "request_type", "") == "software":
                    db.query(SoftwareRequest).filter(SoftwareRequest.id == quote.request_id).update({"status": "in_progress"})
                elif getattr(quote, "request_id", None) and getattr(quote, "request_type", "") == "consultation":
                    db.query(ConsultationRequest).filter(ConsultationRequest.id == quote.request_id).update({"status": "scheduled"})

                if quote.project_id:
                    db.query(ManufacturingRequest).filter(ManufacturingRequest.project_id == quote.project_id).update({"status": "in_progress"})
                    db.query(DesignRequest).filter(DesignRequest.project_id == quote.project_id).update({"status": "in_progress"})
                    db.query(SoftwareRequest).filter(SoftwareRequest.project_id == quote.project_id).update({"status": "in_progress"})
                    db.query(ConsultationRequest).filter(ConsultationRequest.project_id == quote.project_id).update({"status": "scheduled"})

                audit = AuditEvent(
                    id=uuid.uuid4(),
                    user_id=payment.user_id,
                    action="SERVICE_QUOTE_PAID_EXECUTION_UNLOCKED",
                    entity_type="Quote",
                    entity_id=quote.id,
                    details=json.dumps({"payment_id": str(payment.id)}),
                    created_at=now,
                )
                db.add(audit)

        db.commit()
        if order_result:
            db.refresh(order_result)
        return order_result

    @classmethod
    def mark_failed(
        cls,
        db: Session,
        payment_id: uuid.UUID,
        error_code: Optional[str] = None,
        error_description: Optional[str] = None,
        source: str = "system",
    ) -> None:
        """Section 16: Transition Payment to failed on confirmed failure."""
        payment = (
            db.query(Payment)
            .filter(Payment.id == payment_id)
            .with_for_update()
            .first()
        )
        if not payment or payment.status in ("successful", "failed", "refunded"):
            return

        payment.status = "failed"
        payment.error_code = error_code
        payment.error_description = error_description
        payment.updated_at = utcnow()
        db.commit()

    @classmethod
    def get_payment(cls, db: Session, user: User, payment_id: str) -> Dict[str, Any]:
        """PAYMENT-API-003: Payment detail view with IDOR protection."""
        try:
            p_uuid = uuid.UUID(payment_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="PAYMENT_NOT_FOUND",
                message="Payment not found",
            )

        payment = db.query(Payment).filter(
            Payment.id == p_uuid,
            Payment.user_id == user.id,
        ).first()

        if not payment:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="PAYMENT_NOT_FOUND",
                message="Payment not found or not owned by user",
            )

        return {
            "id": str(payment.id),
            "payment_id": str(payment.id),
            "status": payment.status,
            "amount": _rupees(payment.amount),
            "currency": payment.currency,
            "linked_order_id": str(payment.order_id) if payment.order_id else None,
            "linked_quote_id": str(payment.quote_id) if payment.quote_id else None,
            "created_at": payment.created_at.isoformat() if payment.created_at else None,
            "confirmed_at": payment.confirmed_at.isoformat() if payment.confirmed_at else None,
        }

    @classmethod
    def list_payments(cls, db: Session, user: User, page: int = 1, page_size: int = 20) -> Tuple[List[Dict[str, Any]], dict]:
        """PAYMENT-API-004: Paginated list of customer payments."""
        query = db.query(Payment).filter(Payment.user_id == user.id).order_by(Payment.created_at.desc())
        total = query.count()
        payments = query.offset((page - 1) * page_size).limit(page_size).all()

        items = [
            {
                "id": str(p.id),
                "payment_id": str(p.id),
                "status": p.status,
                "amount": _rupees(p.amount),
                "currency": p.currency,
                "linked_order_id": str(p.order_id) if p.order_id else None,
                "linked_quote_id": str(p.quote_id) if p.quote_id else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "confirmed_at": p.confirmed_at.isoformat() if p.confirmed_at else None,
            }
            for p in payments
        ]

        total_pages = max(1, (total + page_size - 1) // page_size)
        pagination = {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        }
        return items, pagination

    @classmethod
    def initiate_refund(
        cls,
        db: Session,
        admin_user: User,
        payment_id: str,
        amount_paise: Optional[int] = None,
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """PAYMENT-API-005: Admin refund initiation with strict RBAC."""
        # 1. RBAC check (SUPER_ADMIN or FINANCE_MANAGER)
        allowed_roles = ("SUPER_ADMIN", "FINANCE_MANAGER")
        if admin_user.role not in allowed_roles and not admin_user.is_superuser:
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="INSUFFICIENT_PERMISSIONS",
                message="Only SUPER_ADMIN or FINANCE_MANAGER may initiate refunds",
            )

        try:
            p_uuid = uuid.UUID(payment_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="PAYMENT_NOT_FOUND",
                message="Payment not found",
            )

        payment = db.query(Payment).filter(Payment.id == p_uuid).with_for_update().first()
        if not payment:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="PAYMENT_NOT_FOUND",
                message="Payment not found",
            )

        if payment.status not in ("successful", "partially_refunded"):
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="PAYMENT_NOT_REFUNDABLE",
                message=f"Cannot refund payment in '{payment.status}' state",
            )

        # Check existing refunds
        existing_refunds = db.query(Refund).filter(Refund.payment_id == payment.id).all()
        already_refunded = sum(r.amount for r in existing_refunds if r.status in ("pending", "processed"))
        remaining = payment.amount - already_refunded

        target_amount = amount_paise if amount_paise is not None else remaining
        if target_amount <= 0:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="REFUND_AMOUNT_INVALID",
                message="No refundable amount remaining on this payment",
            )
        if target_amount > remaining:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="REFUND_EXCEEDS_PAYMENT",
                message=f"Requested refund amount ({target_amount} paise) exceeds remaining refundable amount ({remaining} paise)",
            )

        # Call Razorpay refund gateway
        gateway_refund = razorpay_provider.initiate_refund(
            gateway_payment_id=payment.razorpay_payment_id or str(payment.id),
            amount=target_amount,
        )

        refund_id = uuid.uuid4()
        refund = Refund(
            id=refund_id,
            payment_id=payment.id,
            order_id=payment.order_id,
            user_id=payment.user_id,
            razorpay_refund_id=gateway_refund.id,
            amount=target_amount,
            status="pending",  # Awaits confirmed webhook or status
            reason=reason,
            created_at=utcnow(),
        )
        db.add(refund)

        # Log audit event
        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="REFUND_INITIATED",
            entity_type="Refund",
            entity_id=refund.id,
            details=json.dumps({"payment_id": str(payment.id), "amount_paise": target_amount, "reason": reason}),
            created_at=utcnow(),
        )
        db.add(audit)

        db.commit()
        return {"refund_id": str(refund.id), "status": "initiated"}

    @classmethod
    def mark_refunded(
        cls,
        db: Session,
        payment_id: uuid.UUID,
        refund_gateway_id: Optional[str] = None,
        amount_paise: Optional[int] = None,
        source: str = "system",
    ) -> None:
        """Section 21: Mark refund confirmed via webhook."""
        payment = db.query(Payment).filter(Payment.id == payment_id).with_for_update().first()
        if not payment:
            return

        if refund_gateway_id:
            refund = db.query(Refund).filter(Refund.razorpay_refund_id == refund_gateway_id).first()
            if refund:
                refund.status = "processed"

        # Determine total processed refunds
        all_refunds = db.query(Refund).filter(Refund.payment_id == payment.id).all()
        total_refunded = sum(r.amount for r in all_refunds if r.status == "processed")

        if total_refunded >= payment.amount:
            payment.status = "refunded"
            if payment.order_id:
                order = db.query(Order).filter(Order.id == payment.order_id).first()
                if order:
                    order.status = "cancelled"
        elif total_refunded > 0:
            payment.status = "partially_refunded"

        db.commit()
