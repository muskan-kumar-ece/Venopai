import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, get_current_admin, CurrentUser, CurrentAdmin
from app.models.user import User
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
from app.services.catalog import _paise

router = APIRouter()

@router.post(
    "/initiate",
    response_model=PaymentInitiateResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="PAYMENT-API-001: Initiate Razorpay payment intent",
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
