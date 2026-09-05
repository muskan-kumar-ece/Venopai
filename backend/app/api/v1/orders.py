import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser
from app.services.order import OrderService
from app.schemas.order import (
    OrderDetailResponse,
    OrderListResponse,
    OrderCancelRequest,
    OrderInvoiceResponse,
)

router = APIRouter()

@router.get(
    "",
    response_model=OrderListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ORDER-API-001: List customer orders",
)
def list_orders(
    current_user: CurrentUser,
    status: Optional[str] = Query(None, description="Optional status filter"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List authenticated customer's own orders."""
    data, pagination = OrderService.list_orders(
        db=db,
        user=current_user,
        status=status,
        page=page,
        page_size=page_size,
    )
    return {
        "data": data,
        "pagination": pagination,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{order_id}",
    response_model=OrderDetailResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ORDER-API-002: Customer order detail",
)
def get_order_detail(
    order_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Retrieve full customer order details with immutable snapshots and shipment tracking."""
    data = OrderService.get_order(db=db, user=current_user, order_id=order_id)
    return {
        "data": data,
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{order_id}/cancel",
    response_model=OrderDetailResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ORDER-API-003: Cancel order pre-fulfillment",
)
def cancel_order(
    order_id: str,
    current_user: CurrentUser,
    body: Optional[OrderCancelRequest] = None,
    db: Session = Depends(get_db),
):
    """Customer pre-fulfillment cancellation (ORD-003)."""
    reason = body.reason if body else None
    data = OrderService.cancel_order(db=db, user=current_user, order_id=order_id, reason=reason)
    return {
        "data": data,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{order_id}/invoice",
    response_model=OrderInvoiceResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ORDER-API-004: Download order invoice",
)
def get_order_invoice(
    order_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer invoice download metadata and short-lived signed file URL (TAX-004, SEC-009)."""
    data = OrderService.get_order_invoice(db=db, user=current_user, order_id=order_id)
    return {
        "data": data,
        "request_id": str(uuid.uuid4()),
    }
