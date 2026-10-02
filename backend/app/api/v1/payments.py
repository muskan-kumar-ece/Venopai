import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, get_current_admin, CurrentUser, CurrentAdmin
from app.models.user import User
from app.models.order import Payment
from app.services.payment import PaymentService
from app.schemas.payment import (
    PaymentInitiateRequest,
    PaymentInitiateResponse,
    PaymentConfirmRequest,
    PaymentConfirmResponse,
    PaymentDetailResponse,
    PaymentListResponse,
    AdminRefundRequest,
    AdminRefundResponse,
)
from app.services.catalog import _paise, _rupees
from app.core.rate_limit import RateLimiter

router = APIRouter()

@router.post(
    "/initiate",
    response_model=PaymentInitiateResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="PAYMENT-API-001: Initiate Razorpay payment intent",
    dependencies=[Depends(RateLimiter(limit=15, window_seconds=60, key_prefix="rl:pay_init", scope="user_or_ip"))],
)
def initiate_payment(
    body: PaymentInitiateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Initiates payment for checkout session (commerce) or approved quote (services)."""
    data = PaymentService.initiate_payment(
        db=db,
        user=current_user,
        source_type=body.source_type,
        source_id=body.source_id,
    )
    return {
        "data": data,
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{payment_id}/confirm",
    response_model=PaymentConfirmResponse,
    status_code=http_status.HTTP_200_OK,
    summary="PAYMENT-API-002: Client confirmation of Razorpay payment",
    dependencies=[Depends(RateLimiter(limit=15, window_seconds=60, key_prefix="rl:pay_conf", scope="user_or_ip"))],
)
def confirm_payment(

    payment_id: str,
    body: PaymentConfirmRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Verifies payment signature and triggers transactional success transition."""
    data = PaymentService.confirm_payment(
        db=db,
        user=current_user,
        payment_id=payment_id,
        razorpay_payment_id=body.razorpay_payment_id,
        razorpay_order_id=body.razorpay_order_id,
        razorpay_signature=body.razorpay_signature,
    )
    return {
        "data": data,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{payment_id}",
    response_model=PaymentDetailResponse,
    status_code=http_status.HTTP_200_OK,
    summary="PAYMENT-API-003: Get payment detail",
)
def get_payment_detail(
    payment_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Fetch customer's own payment detail."""
    data = PaymentService.get_payment(db=db, user=current_user, payment_id=payment_id)
    return {
        "data": data,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "",
    response_model=PaymentListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="PAYMENT-API-004: List customer payments",
)
def list_payments(
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Paginated list of customer payments."""
    data, pagination = PaymentService.list_payments(
        db=db,
        user=current_user,
        page=page,
        page_size=page_size,
    )
    return {
        "data": data,
        "pagination": pagination,
        "request_id": str(uuid.uuid4()),
    }


admin_router = APIRouter()

@admin_router.get(
    "",
    status_code=http_status.HTTP_200_OK,
    summary="PAYMENT-API-006: Admin list customer payments",
)
@router.get(
    "/admin",
    status_code=http_status.HTTP_200_OK,
    summary="PAYMENT-API-006: Admin list customer payments",
)
def admin_list_payments(
    admin: CurrentAdmin,
    status: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Admin list payments across all customers with search and filters."""
    query = db.query(Payment).outerjoin(User, Payment.user_id == User.id)
    if status:
        query = query.filter(Payment.status == status.lower())
    if source_type:
        query = query.filter(Payment.source_type == source_type.lower())
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (Payment.razorpay_payment_id.ilike(s)) |
            (Payment.razorpay_order_id.ilike(s)) |
            (User.email.ilike(s)) |
            (User.full_name.ilike(s))
        )
    
    total = query.count()
    payments = (
        query.order_by(Payment.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    
    data = []
    for p in payments:
        refund_total = sum(r.amount for r in p.refunds) if p.refunds else 0
        data.append({
            "id": str(p.id),
            "order_id": str(p.order_id) if p.order_id else None,
            "quote_id": str(p.quote_id) if p.quote_id else None,
            "checkout_session_id": str(p.checkout_session_id) if p.checkout_session_id else None,
            "source_type": getattr(p, "source_type", None) or ("quote" if p.quote_id else ("order" if p.order_id else "direct")),
            "user_id": str(p.user_id),
            "customer_email": p.user.email if p.user else "Unknown",
            "customer_name": p.user.full_name if p.user else "Unknown",
            "gateway_order_id": p.razorpay_order_id,
            "gateway_payment_id": p.razorpay_payment_id,
            "amount_paise": getattr(p, "amount_paise", getattr(p, "amount", 0)),
            "amount_rupees": _rupees(getattr(p, "amount_paise", getattr(p, "amount", 0))),
            "status": p.status,
            "refund_amount_paise": refund_total,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })
        
    return {
        "data": data,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if total > 0 else 1,
        },
        "request_id": str(uuid.uuid4()),
    }


@admin_router.post(
    "/{payment_id}/refund",
    response_model=AdminRefundResponse,
    status_code=http_status.HTTP_202_ACCEPTED,
    summary="PAYMENT-API-005: Admin refund initiation",
)
@router.post(
    "/admin/{payment_id}/refund",
    response_model=AdminRefundResponse,
    status_code=http_status.HTTP_202_ACCEPTED,
    summary="PAYMENT-API-005: Admin refund initiation",
)
def admin_refund_payment(
    payment_id: str,
    body: AdminRefundRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin-initiated full or partial refund (SUPER_ADMIN / FINANCE_MANAGER only)."""
    amount_paise = body.amount_paise if body.amount_paise is not None else (_paise(body.amount) if body.amount else None)
    data = PaymentService.initiate_refund(
        db=db,
        admin_user=admin,
        payment_id=payment_id,
        amount_paise=amount_paise,
        reason=body.reason,
    )
    return {
        "data": data,
        "request_id": str(uuid.uuid4()),
    }
