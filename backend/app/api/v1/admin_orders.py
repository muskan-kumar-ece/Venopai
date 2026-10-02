"""Admin Order & Shipment Management APIs.
Conforms to Document 01 §13, Document 02 §13 & §21, Document 03 §39, Document 04 §42 & §19.
"""
import uuid
import math
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, Query, HTTPException, status as http_status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentAdmin
from app.models.user import User, AuditEvent
from app.models.order import Order, OrderItem, Shipment
from app.integrations.shiprocket.client import shiprocket_provider
from app.services.notification import NotificationService
from app.core.exceptions import APIException

router = APIRouter()


def utcnow():
    return datetime.now(timezone.utc)


def _verify_orders_role(admin: User, write: bool = False):
    """Doc 04 §42: ORDER_MANAGER, SUPER_ADMIN for write; read also allows SUPPORT_EXECUTIVE, FINANCE_MANAGER."""
    role = getattr(admin, "role", "")
    is_su = getattr(admin, "is_superuser", False) or role == "SUPER_ADMIN"
    if is_su:
        return
    if write:
        if role != "ORDER_MANAGER":
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="INSUFFICIENT_ROLE",
                message="Order status modification requires ORDER_MANAGER or SUPER_ADMIN",
            )
    else:
        if role not in ("ORDER_MANAGER", "SUPPORT_EXECUTIVE", "FINANCE_MANAGER"):
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="INSUFFICIENT_ROLE",
                message="Order access requires ORDER_MANAGER, SUPPORT_EXECUTIVE, FINANCE_MANAGER, or SUPER_ADMIN",
            )


class UpdateOrderStatusRequest(BaseModel):
    status: str
    notes: Optional[str] = None


class OrderNoteRequest(BaseModel):
    note: str


class FlagCancellationRequest(BaseModel):
    reason: str


class CreateShipmentRequest(BaseModel):
    carrier: Optional[str] = "Delhivery"
    tracking_number: Optional[str] = None
    weight_grams: Optional[int] = 500


@router.get("", summary="ADMIN-ORD-API-001: List all orders with filters")
def admin_list_orders(
    request: Request,
    admin: CurrentAdmin,
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    _verify_orders_role(admin, write=False)
    query = db.query(Order)
    if status:
        query = query.filter(Order.status == status)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(Order.order_number.ilike(s))

    total = query.count()
    orders = (
        query.order_by(Order.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    data = []
    for ord in orders:
        data.append({
            "id": str(ord.id),
            "order_number": ord.order_number,
            "user_id": str(ord.user_id),
            "status": ord.status,
            "payment_status": ord.payment_status,
            "total_amount_paise": ord.total_amount_paise,
            "currency": ord.currency,
            "created_at": ord.created_at.isoformat() if ord.created_at else None,
            "updated_at": ord.updated_at.isoformat() if ord.updated_at else None,
        })

    return {
        "data": data,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": max(1, math.ceil(total / page_size)),
        },
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }


@router.get("/{order_id}", summary="ADMIN-ORD-API-002: Admin order detail")
def admin_get_order(
    order_id: str,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    _verify_orders_role(admin, write=False)
    try:
        o_uuid = uuid.UUID(order_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Order not found")

    order = db.query(Order).filter(Order.id == o_uuid).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    shipment = db.query(Shipment).filter(Shipment.order_id == order.id).first()

    return {
        "data": {
            "id": str(order.id),
            "order_number": order.order_number,
            "user_id": str(order.user_id),
            "status": order.status,
            "payment_status": order.payment_status,
            "total_amount_paise": order.total_amount_paise,
            "subtotal_paise": order.subtotal_paise,
            "tax_paise": order.tax_paise,
            "shipping_amount_paise": order.shipping_amount_paise,
            "shipping_address": order.shipping_address_snapshot,
            "items": [
                {
                    "id": str(item.id),
                    "product_id": str(item.product_id),
                    "title": item.title,
                    "sku": item.sku,
                    "quantity": item.quantity,
                    "unit_price_paise": item.unit_price_paise,
                    "total_price_paise": item.total_price_paise,
                }
                for item in items
            ],
            "shipment": {
                "id": str(shipment.id),
                "tracking_number": shipment.tracking_number,
                "carrier": shipment.carrier or "Delhivery",
                "status": shipment.status,
                "estimated_delivery": shipment.estimated_delivery.isoformat() if shipment.estimated_delivery else None,
            } if shipment else None,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        },
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }


@router.patch("/{order_id}/status", summary="ADMIN-ORD-API-003: Update order status")
def admin_update_order_status(
    order_id: str,
    body: UpdateOrderStatusRequest,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    _verify_orders_role(admin, write=True)
    try:
        o_uuid = uuid.UUID(order_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Order not found")

    order = db.query(Order).filter(Order.id == o_uuid).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    old_status = order.status
    order.status = body.status
    order.updated_at = utcnow()

    # Audit event
    audit = AuditEvent(
        user_id=admin.id,
        action="UPDATE_ORDER_STATUS",
        resource_type="order",
        resource_id=str(order.id),
        details={"from": old_status, "to": body.status, "notes": body.notes},
    )
    db.add(audit)
    db.commit()

    NotificationService.notify_status_change(db, order.user_id, "Order", body.status, ref_id=order.order_number)

    return {
        "data": {"id": str(order.id), "status": order.status, "updated_at": order.updated_at.isoformat()},
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }


@router.post("/{order_id}/notes", summary="ADMIN-ORD-API-004: Add internal order note")
def admin_add_order_note(
    order_id: str,
    body: OrderNoteRequest,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    _verify_orders_role(admin, write=False)
    try:
        o_uuid = uuid.UUID(order_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Order not found")

    order = db.query(Order).filter(Order.id == o_uuid).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    audit = AuditEvent(
        user_id=admin.id,
        action="ADD_ORDER_NOTE",
        resource_type="order",
        resource_id=str(order.id),
        details={"note": body.note},
    )
    db.add(audit)
    db.commit()

    return {
        "status": "note_recorded",
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }


@router.post("/{order_id}/flag-cancellation", summary="ADMIN-ORD-API-005: Flag order for cancellation review")
def admin_flag_cancellation(
    order_id: str,
    body: FlagCancellationRequest,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    _verify_orders_role(admin, write=False)
    try:
        o_uuid = uuid.UUID(order_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Order not found")

    order = db.query(Order).filter(Order.id == o_uuid).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    audit = AuditEvent(
        user_id=admin.id,
        action="FLAG_ORDER_CANCELLATION",
        resource_type="order",
        resource_id=str(order.id),
        details={"reason": body.reason},
    )
    db.add(audit)
    db.commit()

    return {
        "status": "cancellation_flagged",
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }


@router.post("/{order_id}/shipment", summary="ADMIN-SHIP-API-001: Create order shipment")
def admin_create_order_shipment(
    order_id: str,
    body: CreateShipmentRequest,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    _verify_orders_role(admin, write=True)
    try:
        o_uuid = uuid.UUID(order_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Order not found")

    order = db.query(Order).filter(Order.id == o_uuid).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    shipment = db.query(Shipment).filter(Shipment.order_id == order.id).first()
    if not shipment:
        carrier = body.carrier or "Delhivery"
        tracking = body.tracking_number
        sr_order_id = None
        if not tracking:
            ship_res = shiprocket_provider.create_shipment(
                reference_id=str(order.id),
                pickup_pincode="500001",
                delivery_pincode=order.shipping_address_snapshot.get("pincode", "500001") if order.shipping_address_snapshot else "500001",
                weight_grams=body.weight_grams or 500,
            )
            tracking = ship_res.get("tracking_number")
            sr_order_id = ship_res.get("shiprocket_order_id")
            carrier = ship_res.get("carrier") or carrier

        shipment = Shipment(
            id=uuid.uuid4(),
            order_id=order.id,
            shiprocket_order_id=sr_order_id,
            tracking_number=tracking,
            carrier=carrier,
            status="created",
            created_at=utcnow(),
        )
        db.add(shipment)

    order.status = "shipped"
    order.updated_at = utcnow()

    audit = AuditEvent(
        user_id=admin.id,
        action="CREATE_SHIPMENT",
        resource_type="shipment",
        resource_id=str(shipment.id),
        details={"order_id": str(order.id), "tracking_number": shipment.tracking_number},
    )
    db.add(audit)
    db.commit()
    db.refresh(shipment)

    NotificationService.notify_shipment_update(db, order.user_id, f"{shipment.tracking_number} (shipped)")

    return {
        "data": {
            "id": str(shipment.id),
            "order_id": str(shipment.order_id),
            "carrier": shipment.carrier,
            "tracking_number": shipment.tracking_number,
            "status": shipment.status,
            "created_at": shipment.created_at.isoformat() if shipment.created_at else None,
        },
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }
