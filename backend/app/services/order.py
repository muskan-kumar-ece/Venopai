import uuid
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import status as http_status

from app.core.exceptions import APIException
from app.models.user import User, AuditEvent, utcnow
from app.models.catalog import Inventory
from app.models.order import Order, OrderItem, Payment, Shipment
from app.services.catalog import _rupees

class OrderService:
    """ORDER-API-001 - ORDER-API-004: Customer Order management."""

    @classmethod
    def list_orders(
        cls,
        db: Session,
        user: User,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[Dict[str, Any]], dict]:
        """ORDER-API-001: Paginated list of customer orders."""
        query = db.query(Order).filter(Order.user_id == user.id)
        if status:
            query = query.filter(Order.status == status.strip().lower())

        query = query.order_by(Order.created_at.desc())
        total = query.count()
        orders = query.offset((page - 1) * page_size).limit(page_size).all()

        items = []
        for o in orders:
            # Payment status lookup
            pay_status = "successful" if o.status != "pending_payment" else "pending"
            if o.payments:
                latest_payment = sorted(o.payments, key=lambda p: p.created_at, reverse=True)[0]
                pay_status = latest_payment.status

            items.append({
                "id": str(o.id),
                "order_number": o.order_number,
                "status": o.status,
                "payment_status": pay_status,
                "total": _rupees(o.total_paise),
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "item_count": len(o.items) if o.items else 0,
            })

        total_pages = max(1, (total + page_size - 1) // page_size)
        pagination = {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        }
        return items, pagination

    @classmethod
    def get_order(cls, db: Session, user: User, order_id: str) -> Dict[str, Any]:
        """ORDER-API-002: Customer Order detail view with IDOR protection."""
        order = None
        try:
            o_uuid = uuid.UUID(order_id)
            order = db.query(Order).filter(
                Order.id == o_uuid,
                Order.user_id == user.id,
            ).first()
        except ValueError:
            clean_num = order_id.strip().upper()
            order = db.query(Order).filter(
                func.upper(Order.order_number) == clean_num,
                Order.user_id == user.id,
            ).first()

        if not order:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="ORDER_NOT_FOUND",
                message="Order not found or not owned by user",
            )

        # Payment status
        pay_status = "successful"
        if order.payments:
            latest = sorted(order.payments, key=lambda p: p.created_at, reverse=True)[0]
            pay_status = latest.status

        # Items
        items_data = []
        for it in order.items:
            unit_p = it.unit_price_paise or it.price_at_time_of_order
            tot_p = it.total_paise or (unit_p * it.quantity)
            items_data.append({
                "product_id": str(it.product_id),
                "name": it.product_name or (it.product.name if it.product else "Product"),
                "unit_price": _rupees(unit_p),
                "quantity": it.quantity,
                "line_total": _rupees(tot_p),
            })

        # Address snapshot
        addr_data = None
        if order.shipping_address_snapshot:
            try:
                addr_data = json.loads(order.shipping_address_snapshot)
            except Exception:
                pass
        if not addr_data and order.shipping_address:
            addr_data = {
                "recipient_name": order.shipping_address.recipient_name,
                "phone": order.shipping_address.phone,
                "line1": order.shipping_address.line1,
                "line2": order.shipping_address.line2,
                "city": order.shipping_address.city,
                "state": order.shipping_address.state,
                "pincode": order.shipping_address.pincode,
                "country": order.shipping_address.country,
            }

        # Shipment
        shipment_data = None
        if order.shipment:
            shipment_data = {
                "id": str(order.shipment.id),
                "status": order.shipment.status,
                "tracking_number": order.shipment.tracking_number,
                "carrier": "Delhivery via Shiprocket",
            }

        # Tax
        tax_data = {
            "type": order.tax_type,
            "amount": _rupees(order.tax_amount_paise),
            "cgst_amount": _rupees(order.cgst_amount_paise) if order.cgst_amount_paise is not None else None,
            "sgst_amount": _rupees(order.sgst_amount_paise) if order.sgst_amount_paise is not None else None,
            "igst_amount": _rupees(order.igst_amount_paise) if order.igst_amount_paise is not None else None,
        }

        return {
            "id": str(order.id),
            "order_number": order.order_number,
            "status": order.status,
            "payment_status": pay_status,
            "items": items_data,
            "subtotal": _rupees(order.subtotal_paise),
            "shipping_amount": _rupees(order.shipping_rate_paise),
            "tax": tax_data,
            "total": _rupees(order.total_paise),
            "shipping_address": addr_data,
            "shipment": shipment_data,
            "estimated_delivery": None,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "paid_at": order.paid_at.isoformat() if order.paid_at else None,
        }

    @classmethod
    def cancel_order(cls, db: Session, user: User, order_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
        """ORDER-API-003: Cancel pre-fulfillment order."""
        try:
            o_uuid = uuid.UUID(order_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="ORDER_NOT_FOUND",
                message="Order not found",
            )

        order = db.query(Order).filter(
            Order.id == o_uuid,
            Order.user_id == user.id,
        ).first()

        if not order:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="ORDER_NOT_FOUND",
                message="Order not found or not owned by user",
            )

        if order.status not in ("paid", "processing", "pending_payment"):
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="ORDER_NOT_CANCELLABLE",
                message=f"Order in status '{order.status}' cannot be cancelled by customer",
            )

        order.status = "cancelled"

        # Contract compliance (ORD-003, Doc 01 §21, Doc 02 §12):
        # Post-payment customer cancellation does NOT automatically restock inventory.
        # Stock remains as sold; cancellation triggers the refund workflow (Finance notification).
        # Any physical inventory return/adjustment requires explicit admin inventory adjustment.

        # Log audit event triggering refund workflow
        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=user.id,
            action="ORDER_CANCELLED_BY_CUSTOMER",
            entity_type="Order",
            entity_id=order.id,
            details=json.dumps({
                "reason": reason,
                "refund_workflow_triggered": True,
                "order_number": order.order_number,
                "amount_paise": order.total_paise,
                "inventory_restocked": False,
            }),
            created_at=utcnow(),
        )
        db.add(audit)
        db.commit()

        return cls.get_order(db, user, str(order.id))

    @classmethod
    def get_order_invoice(cls, db: Session, user: User, order_id: str) -> Dict[str, Any]:
        """ORDER-API-004: Download invoice / invoice details with TAX-004 tax breakdown."""
        order = None
        try:
            o_uuid = uuid.UUID(order_id)
            order = db.query(Order).filter(
                Order.id == o_uuid,
                Order.user_id == user.id,
            ).first()
        except ValueError:
            clean_num = order_id.strip().upper()
            order = db.query(Order).filter(
                func.upper(Order.order_number) == clean_num,
                Order.user_id == user.id,
            ).first()

        if not order:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="ORDER_NOT_FOUND",
                message="Order not found or not owned by user",
            )

        # Tax breakdown per TAX-004
        tax_breakdown = {
            "type": order.tax_type or "GST",
            "amount": _rupees(order.tax_amount_paise or 0),
            "cgst_amount": _rupees(order.cgst_amount_paise or 0) if order.cgst_amount_paise is not None else None,
            "sgst_amount": _rupees(order.sgst_amount_paise or 0) if order.sgst_amount_paise is not None else None,
            "igst_amount": _rupees(order.igst_amount_paise or 0) if order.igst_amount_paise is not None else None,
        }

        # Item lines
        items_data = []
        for it in order.items:
            unit_p = it.unit_price_paise or it.price_at_time_of_order or 0
            tot_p = it.total_paise or (unit_p * it.quantity)
            items_data.append({
                "product_id": str(it.product_id),
                "name": it.product_name or (it.product.name if it.product else "Product"),
                "unit_price": _rupees(unit_p),
                "quantity": it.quantity,
                "line_total": _rupees(tot_p),
            })

        # Generate signed short-lived download URL (Document 04 §14 ORDER-API-004)
        from app.core.security import create_access_token
        download_token = create_access_token(
            subject=str(user.id),
            role="customer",
            is_admin=False,
            audience="customer",
            expires_delta=timedelta(minutes=15),
        )
        invoice_url = f"/api/v1/orders/{order.id}/invoice/download?token={download_token}"

        now_utc = datetime.now(timezone.utc)
        expires_at = now_utc + timedelta(minutes=15)

        return {
            "invoice_number": f"INV-{order.order_number}",
            "order_id": str(order.id),
            "order_number": order.order_number,
            "invoice_url": invoice_url,
            "subtotal": _rupees(order.subtotal_paise or 0),
            "tax_total": _rupees(order.tax_amount_paise or 0),
            "shipping_total": _rupees(order.shipping_rate_paise or 0),
            "total": _rupees(order.total_paise or 0),
            "currency": "INR",
            "tax_breakdown": tax_breakdown,
            "items": items_data,
            "issued_at": order.paid_at.isoformat() if order.paid_at else order.created_at.isoformat(),
            "expires_at": expires_at.isoformat(),
        }
