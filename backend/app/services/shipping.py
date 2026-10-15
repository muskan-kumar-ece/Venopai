"""Shipping Service (Document 01 §17, Document 02 §15, Document 04 §15 & §19).

Encapsulates:
- Order and Manufacturing shipment booking lifecycle
- Strict order and deliverable eligibility enforcement
- Concurrency control and local booking intent persistence
- External Shiprocket API invocation outside DB transactions
- Safe reconciliation for uncertain booking outcomes
- Monotonic status updates without premature "shipped" advancement
"""
from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, List, Optional
import uuid

from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import APIException
from app.integrations.shiprocket import shiprocket_provider
from app.integrations.shiprocket.exceptions import (
    ShiprocketError,
    ShiprocketConnectionError,
    ShiprocketResponseError,
    sanitize_message,
)
from app.models.order import (
    Order,
    Shipment,
    ShippingManifest,
    ShipmentTrackingEvent,
    ShippingWebhookInbox,
)
from app.models.project import ManufacturingRequest
from app.models.user import Address, AuditEvent, User
from app.services.notification import NotificationService

logger = logging.getLogger("venopai.services.shipping")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


TRACKING_STATUS_RANKS = {
    "pending": -1,
    "created": 0,
    "ready_to_ship": 1,
    "in_transit": 2,
    "out_for_delivery": 3,
    "delivered": 4,
    "rto_initiated": 5,
    "returned": 6,
    "rto_delivered": 6,
    "cancelled": 7,
}

TERMINAL_TRACKING_STATES = {"delivered", "returned", "rto_delivered", "cancelled"}

ALLOWED_TRACKING_TRANSITIONS = {
    "pending": {"created", "ready_to_ship", "in_transit", "exception", "cancelled"},
    "created": {"ready_to_ship", "in_transit", "exception", "cancelled"},
    "ready_to_ship": {"in_transit", "out_for_delivery", "delivered", "exception", "cancelled"},
    "in_transit": {"out_for_delivery", "delivered", "exception", "rto_initiated", "cancelled"},
    "out_for_delivery": {"delivered", "in_transit", "exception", "rto_initiated"},
    "exception": {"in_transit", "out_for_delivery", "delivered", "rto_initiated", "cancelled"},
    "rto_initiated": {"rto_delivered", "returned", "delivered"},
    "delivered": set(),
    "cancelled": set(),
    "returned": set(),
    "rto_delivered": set(),
}


def normalize_tracking_status(raw: Optional[str]) -> str:
    """Map raw carrier status into VenopAI canonical tracking status."""
    if not raw:
        return "in_transit"
    s = raw.strip().upper()
    if "DELIVERED" in s and "RTO" not in s:
        return "delivered"
    if "OUT FOR DELIVERY" in s or "OFD" in s:
        if "RTO" in s:
            return "rto_initiated"
        return "out_for_delivery"
    if "RTO DELIVERED" in s or ("RETURN" in s and "DELIVERED" in s):
        return "returned"
    if "RTO" in s or "RETURN" in s:
        return "rto_initiated"
    if "CANCEL" in s:
        return "cancelled"
    if any(k in s for k in ["IN TRANSIT", "SHIPPED", "PICKED UP", "REACHED", "DISPATCHED"]):
        return "in_transit"
    if any(k in s for k in ["MANIFEST", "PICKUP SCHEDULED", "AWB", "READY", "NEW"]):
        return "ready_to_ship"
    return "in_transit"


def parse_carrier_timestamp(ts: Any) -> Optional[datetime]:
    """Parse various datetime representations from carriers and timestamps safely into UTC."""
    if not ts:
        return None
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            return ts.replace(tzinfo=timezone.utc)
        return ts
    ts_str = str(ts).strip()
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(ts_str, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


class ShippingService:
    """Core domain service for physical shipment lifecycle and courier operations."""

    # -------------------------------------------------------------------------
    # 1. Order Shipment Creation
    # -------------------------------------------------------------------------

    @classmethod
    def create_order_shipment(
        cls,
        db: Session,
        admin_user: User,
        order_id: str,
        data: Dict[str, Any],
    ) -> Shipment:
        """ADMIN-SHIP-API-001: Create and book shipment for a commerce order.
        
        Rules:
        - Order must be in eligible state: paid, processing, ready_to_ship.
        - Reject if already shipped, delivered, completed, or cancelled (409).
        - Lock order row and persist booking intent (booking_in_progress) in DB.
        - Call Shiprocket external API outside open DB transaction.
        - Order transitions to ready_to_ship (NOT shipped until verified pickup).
        - Handle timeouts with reconciliation_required without blind retry.
        """
        try:
            o_uuid = uuid.UUID(order_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="ORDER_NOT_FOUND", message="Order not found")

        # 1. Row-lock order and validate eligibility
        order = db.query(Order).filter(Order.id == o_uuid).with_for_update().first()
        if not order:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="ORDER_NOT_FOUND", message="Order not found")

        eligible_states = {"paid", "processing", "ready_to_ship"}
        if order.status not in eligible_states:
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="INVALID_ORDER_STATE",
                message=f"Order in status '{order.status}' is not eligible for shipment creation. Must be paid, processing, or ready_to_ship.",
            )

        # 2. Check existing shipment
        existing_shipment = db.query(Shipment).filter(Shipment.order_id == order.id).first()
        if existing_shipment:
            if existing_shipment.booking_status == "awb_assigned":
                return existing_shipment
            if existing_shipment.booking_status == "booking_in_progress":
                up_dt = existing_shipment.updated_at
                if up_dt:
                    if up_dt.tzinfo is None:
                        up_dt = up_dt.replace(tzinfo=timezone.utc)
                    if (utcnow() - up_dt).total_seconds() > 600:
                        logger.warning(f"Shipment {existing_shipment.id} had stale booking_in_progress. Marking as reconciliation_required.")
                        existing_shipment.booking_status = "reconciliation_required"
                        existing_shipment.reconciliation_notes = "Booking intent timed out after 10 minutes without completion."
                        db.commit()
                raise APIException(
                    status_code=http_status.HTTP_409_CONFLICT,
                    code="BOOKING_IN_PROGRESS",
                    message="A booking request for this order is already in progress. Please wait.",
                )
            if existing_shipment.booking_status == "reconciliation_required":
                raise APIException(
                    status_code=http_status.HTTP_409_CONFLICT,
                    code="RECONCILIATION_REQUIRED",
                    message="Previous booking outcome was uncertain. Run reconciliation before retrying.",
                )

        carrier = data.get("carrier") or "Delhivery"
        tracking_num = data.get("tracking_number")

        # Case A: Manual tracking number provided by admin
        if tracking_num:
            if not existing_shipment:
                existing_shipment = Shipment(
                    id=uuid.uuid4(),
                    order_id=order.id,
                    carrier=carrier,
                    tracking_number=tracking_num,
                    booking_status="awb_assigned",
                    status="created",
                    created_at=utcnow(),
                )
                db.add(existing_shipment)
            else:
                existing_shipment.carrier = carrier
                existing_shipment.tracking_number = tracking_num
                existing_shipment.booking_status = "awb_assigned"
                existing_shipment.status = "created"
                existing_shipment.updated_at = utcnow()

            # Advance to ready_to_ship (never prematurely mark as shipped)
            if order.status in ("paid", "processing"):
                order.status = "ready_to_ship"
                order.updated_at = utcnow()

            audit = AuditEvent(
                id=uuid.uuid4(),
                user_id=admin_user.id,
                action="CREATE_SHIPMENT_MANUAL",
                resource_type="shipment",
                resource_id=str(existing_shipment.id),
                details=json.dumps({"order_id": str(order.id), "tracking_number": tracking_num, "carrier": carrier}),
                created_at=utcnow(),
            )
            db.add(audit)
            db.commit()
            db.refresh(existing_shipment)
            NotificationService.notify_shipment_update(db, order.user_id, f"{tracking_num} (ready_to_ship)")
            return existing_shipment

        # Case B: Automated Shiprocket Booking
        # Resolve delivery address
        customer_details: Dict[str, Any] = {}
        delivery_pincode = "500001"
        if order.shipping_address_snapshot:
            try:
                snap = json.loads(order.shipping_address_snapshot)
                if isinstance(snap, dict):
                    customer_details = snap
                    delivery_pincode = str(snap.get("pincode") or delivery_pincode).strip()
            except Exception:
                pass
        elif order.shipping_address:
            addr = order.shipping_address
            delivery_pincode = str(addr.pincode).strip()
            customer_details = {
                "recipient_name": addr.recipient_name,
                "phone": addr.phone,
                "line1": addr.line1,
                "line2": addr.line2,
                "city": addr.city,
                "state": addr.state,
                "pincode": addr.pincode,
                "country": addr.country,
            }

        # Resolve order items
        order_items = []
        if order.items:
            for it in order.items:
                p_name = it.product_name or (it.product.name if it.product else "Hardware Component")
                sku = (it.product.sku if it.product else None) or f"SKU-{str(it.id)[:6]}"
                price_rs = float(it.unit_price_paise or it.price_at_time_of_order or 10000) / 100.0
                order_items.append({
                    "name": p_name,
                    "sku": sku,
                    "quantity": it.quantity,
                    "unit_price": price_rs,
                })

        weight_grams = data.get("weight_grams") or 500
        dimensions = data.get("dimensions")
        courier_id = data.get("courier_id")
        pickup_pincode = settings.SHIPROCKET_ORIGIN_PINCODE

        # 3. Persist local booking intent before calling external API
        idemp_key = f"book_order_{order.id}_{uuid.uuid4().hex[:8]}"
        if not existing_shipment:
            shipment = Shipment(
                id=uuid.uuid4(),
                order_id=order.id,
                carrier=carrier,
                booking_status="booking_in_progress",
                status="pending",
                idempotency_key=idemp_key,
                created_at=utcnow(),
            )
            db.add(shipment)
        else:
            shipment = existing_shipment
            shipment.booking_status = "booking_in_progress"
            shipment.idempotency_key = idemp_key
            shipment.last_booking_error = None
            shipment.updated_at = utcnow()

        db.commit()
        db.refresh(shipment)
        shipment_uuid = shipment.id
        order_user_id = order.user_id

        # 4. Invoke external Shiprocket API (OUTSIDE DB TRANSACTION)
        try:
            booking_res = shiprocket_provider.create_shipment(
                reference_id=str(order.order_number or order.id),
                pickup_pincode=pickup_pincode,
                delivery_pincode=delivery_pincode,
                weight_grams=weight_grams,
                dimensions=dimensions,
                order_items=order_items,
                customer_details=customer_details,
                courier_id=courier_id,
            )
        except ShiprocketConnectionError as conn_err:
            # Network timeout: outcome is uncertain! Mark for reconciliation, do not retry blindly.
            logger.error(f"Timeout while creating Shiprocket order for order {order_id}: {conn_err}")
            shipment = db.query(Shipment).filter(Shipment.id == shipment_uuid).first()
            if shipment:
                shipment.booking_status = "reconciliation_required"
                shipment.last_booking_error = sanitize_message(str(conn_err))
                shipment.updated_at = utcnow()
                db.commit()
            raise APIException(
                status_code=http_status.HTTP_504_GATEWAY_TIMEOUT,
                code="SHIPMENT_BOOKING_TIMEOUT",
                message="Carrier network timed out. Shipment marked for reconciliation to prevent duplicate booking.",
            )
        except ShiprocketError as prov_err:
            # Definite provider failure / 4xx rejection
            logger.error(f"Provider rejected shipment booking for order {order_id}: {prov_err}")
            shipment = db.query(Shipment).filter(Shipment.id == shipment_uuid).first()
            if shipment:
                shipment.booking_status = "booking_failed"
                shipment.last_booking_error = sanitize_message(str(prov_err))
                shipment.updated_at = utcnow()
                db.commit()
            raise APIException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                code="SHIPMENT_BOOKING_FAILED",
                message=f"Carrier rejected shipment booking: {sanitize_message(str(prov_err))}",
            )

        # 5. Persist confirmed booking outcome
        shipment = db.query(Shipment).filter(Shipment.id == shipment_uuid).first()
        order = db.query(Order).filter(Order.id == o_uuid).first()

        sr_order_id = booking_res.get("shiprocket_order_id")
        sr_shipment_id = booking_res.get("shipment_id") or booking_res.get("shiprocket_shipment_id")
        tracking = booking_res.get("tracking_number")
        carrier = booking_res.get("carrier") or carrier
        courier_comp_id = booking_res.get("courier_company_id")
        b_status = booking_res.get("booking_status", "awb_assigned")

        shipment.shiprocket_order_id = sr_order_id
        shipment.shiprocket_shipment_id = sr_shipment_id
        shipment.tracking_number = tracking
        shipment.carrier = carrier
        shipment.courier_company_id = courier_comp_id
        shipment.booking_status = b_status
        shipment.status = "created" if tracking else "pending"
        shipment.updated_at = utcnow()

        # Advance order status to ready_to_ship (ready for courier pickup)
        if order and order.status in ("paid", "processing"):
            order.status = "ready_to_ship"
            order.updated_at = utcnow()

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="CREATE_SHIPMENT_LIVE",
            resource_type="shipment",
            resource_id=str(shipment.id),
            details=json.dumps({
                "order_id": str(order_id),
                "shiprocket_order_id": sr_order_id,
                "shiprocket_shipment_id": sr_shipment_id,
                "tracking_number": tracking,
                "booking_status": b_status,
            }),
            created_at=utcnow(),
        )
        db.add(audit)
        db.commit()
        db.refresh(shipment)

        # Notify customer only when genuine tracking is assigned
        if tracking:
            NotificationService.notify_shipment_update(db, order_user_id, f"{tracking} (ready_to_ship)")

        return shipment

    # -------------------------------------------------------------------------
    # 2. Manufacturing Deliverable Shipment Creation
    # -------------------------------------------------------------------------

    @classmethod
    def create_manufacturing_shipment(
        cls,
        db: Session,
        admin_user: User,
        mfg_id: str,
        data: Dict[str, Any],
    ) -> Shipment:
        """ADMIN-SHIP-API-002: Create and book shipment for a physical manufacturing deliverable.
        
        Rules:
        - Request must be completed_execution (physical prototype finished).
        - Must not be already delivered, completed, or cancelled (409).
        - Preserve completed_execution status until verified delivery (do NOT mark delivered).
        """
        try:
            m_uuid = uuid.UUID(mfg_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Manufacturing request not found")

        mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == m_uuid).with_for_update().first()
        if not mfg:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Manufacturing request not found")

        # Verify eligibility
        if mfg.status in ("delivered", "completed", "cancelled"):
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="INVALID_STATE_TRANSITION",
                message=f"Manufacturing request in status '{mfg.status}' cannot be dispatched.",
            )

        if mfg.status != "completed_execution":
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="INVALID_STATE_TRANSITION",
                message=f"Manufacturing request must reach 'completed_execution' before dispatch (currently '{mfg.status}').",
            )

        # Check existing shipment
        existing_shipment = db.query(Shipment).filter(Shipment.manufacturing_request_id == mfg.id).first()
        if existing_shipment:
            if existing_shipment.booking_status == "awb_assigned":
                return existing_shipment
            if existing_shipment.booking_status == "booking_in_progress":
                up_dt = existing_shipment.updated_at
                if up_dt:
                    if up_dt.tzinfo is None:
                        up_dt = up_dt.replace(tzinfo=timezone.utc)
                    if (utcnow() - up_dt).total_seconds() > 600:
                        logger.warning(f"Shipment {existing_shipment.id} had stale booking_in_progress. Marking as reconciliation_required.")
                        existing_shipment.booking_status = "reconciliation_required"
                        existing_shipment.reconciliation_notes = "Booking intent timed out after 10 minutes without completion."
                        db.commit()
                raise APIException(
                    status_code=http_status.HTTP_409_CONFLICT,
                    code="BOOKING_IN_PROGRESS",
                    message="A booking request for this deliverable is already in progress.",
                )
            if existing_shipment.booking_status == "reconciliation_required":
                raise APIException(
                    status_code=http_status.HTTP_409_CONFLICT,
                    code="RECONCILIATION_REQUIRED",
                    message="Previous booking outcome was uncertain. Run reconciliation before retrying.",
                )

        carrier = data.get("carrier") or "Delhivery"
        tracking_num = data.get("tracking_number")

        # Case A: Manual tracking number
        if tracking_num:
            if not existing_shipment:
                existing_shipment = Shipment(
                    id=uuid.uuid4(),
                    manufacturing_request_id=mfg.id,
                    carrier=carrier,
                    tracking_number=tracking_num,
                    booking_status="awb_assigned",
                    status="created",
                    created_at=utcnow(),
                )
                db.add(existing_shipment)
            else:
                existing_shipment.carrier = carrier
                existing_shipment.tracking_number = tracking_num
                existing_shipment.booking_status = "awb_assigned"
                existing_shipment.status = "created"
                existing_shipment.updated_at = utcnow()

            audit = AuditEvent(
                id=uuid.uuid4(),
                user_id=admin_user.id,
                action="CREATE_MANUFACTURING_SHIPMENT_MANUAL",
                resource_type="shipment",
                resource_id=str(existing_shipment.id),
                details=json.dumps({"manufacturing_request_id": str(mfg.id), "tracking_number": tracking_num}),
                created_at=utcnow(),
            )
            db.add(audit)
            db.commit()
            db.refresh(existing_shipment)
            NotificationService.notify_shipment_update(db, mfg.user_id, f"{tracking_num} (ready_to_ship)")
            return existing_shipment

        # Case B: Automated Shiprocket Booking
        # Address resolution
        customer_details: Dict[str, Any] = {}
        delivery_pincode = str(data.get("delivery_pincode") or "500001").strip()

        # Check customer saved address
        addr = db.query(Address).filter(Address.user_id == mfg.user_id, Address.is_default == True).first()
        if not addr:
            addr = db.query(Address).filter(Address.user_id == mfg.user_id).first()

        if addr:
            delivery_pincode = str(addr.pincode).strip()
            customer_details = {
                "recipient_name": addr.recipient_name,
                "phone": addr.phone,
                "line1": addr.line1,
                "line2": addr.line2,
                "city": addr.city,
                "state": addr.state,
                "pincode": addr.pincode,
                "country": addr.country,
            }

        order_items = [
            {
                "name": f"Prototype: {mfg.title[:200]} ({mfg.prototype_type})",
                "sku": f"MFG-{str(mfg.id)[:8].upper()}",
                "quantity": max(1, mfg.quantity or 1),
                "unit_price": 500.0,
            }
        ]

        weight_grams = data.get("weight_grams") or 500
        dimensions = data.get("dimensions")
        courier_id = data.get("courier_id")
        pickup_pincode = settings.SHIPROCKET_ORIGIN_PINCODE

        # Persist booking intent
        idemp_key = f"book_mfg_{mfg.id}_{uuid.uuid4().hex[:8]}"
        if not existing_shipment:
            shipment = Shipment(
                id=uuid.uuid4(),
                manufacturing_request_id=mfg.id,
                carrier=carrier,
                booking_status="booking_in_progress",
                status="pending",
                idempotency_key=idemp_key,
                created_at=utcnow(),
            )
            db.add(shipment)
        else:
            shipment = existing_shipment
            shipment.booking_status = "booking_in_progress"
            shipment.idempotency_key = idemp_key
            shipment.last_booking_error = None
            shipment.updated_at = utcnow()

        db.commit()
        db.refresh(shipment)
        shipment_uuid = shipment.id
        mfg_user_id = mfg.user_id

        # Invoke Shiprocket external API outside DB transaction
        try:
            booking_res = shiprocket_provider.create_shipment(
                reference_id=f"MFG-{str(mfg.id)[:8]}",
                pickup_pincode=pickup_pincode,
                delivery_pincode=delivery_pincode,
                weight_grams=weight_grams,
                dimensions=dimensions,
                order_items=order_items,
                customer_details=customer_details,
                courier_id=courier_id,
            )
        except ShiprocketConnectionError as conn_err:
            logger.error(f"Timeout while creating Shiprocket order for manufacturing {mfg_id}: {conn_err}")
            shipment = db.query(Shipment).filter(Shipment.id == shipment_uuid).first()
            if shipment:
                shipment.booking_status = "reconciliation_required"
                shipment.last_booking_error = sanitize_message(str(conn_err))
                shipment.updated_at = utcnow()
                db.commit()
            raise APIException(
                status_code=http_status.HTTP_504_GATEWAY_TIMEOUT,
                code="SHIPMENT_BOOKING_TIMEOUT",
                message="Carrier network timed out. Shipment marked for reconciliation.",
            )
        except ShiprocketError as prov_err:
            logger.error(f"Provider rejected manufacturing shipment booking for {mfg_id}: {prov_err}")
            shipment = db.query(Shipment).filter(Shipment.id == shipment_uuid).first()
            if shipment:
                shipment.booking_status = "booking_failed"
                shipment.last_booking_error = sanitize_message(str(prov_err))
                shipment.updated_at = utcnow()
                db.commit()
            raise APIException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                code="SHIPMENT_BOOKING_FAILED",
                message=f"Carrier rejected shipment booking: {sanitize_message(str(prov_err))}",
            )

        # Update confirmed shipment
        shipment = db.query(Shipment).filter(Shipment.id == shipment_uuid).first()
        sr_order_id = booking_res.get("shiprocket_order_id")
        sr_shipment_id = booking_res.get("shipment_id") or booking_res.get("shiprocket_shipment_id")
        tracking = booking_res.get("tracking_number")
        carrier = booking_res.get("carrier") or carrier
        courier_comp_id = booking_res.get("courier_company_id")
        b_status = booking_res.get("booking_status", "awb_assigned")

        shipment.shiprocket_order_id = sr_order_id
        shipment.shiprocket_shipment_id = sr_shipment_id
        shipment.tracking_number = tracking
        shipment.carrier = carrier
        shipment.courier_company_id = courier_comp_id
        shipment.booking_status = b_status
        shipment.status = "created" if tracking else "pending"
        shipment.updated_at = utcnow()

        # Retain mfg.status as 'completed_execution' until confirmed delivery!
        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="CREATE_MANUFACTURING_SHIPMENT_LIVE",
            resource_type="shipment",
            resource_id=str(shipment.id),
            details=json.dumps({
                "manufacturing_request_id": str(mfg_id),
                "shiprocket_order_id": sr_order_id,
                "tracking_number": tracking,
                "booking_status": b_status,
            }),
            created_at=utcnow(),
        )
        db.add(audit)
        db.commit()
        db.refresh(shipment)

        if tracking:
            NotificationService.notify_shipment_update(db, mfg_user_id, f"{tracking} (ready_to_ship)")

        return shipment

    # -------------------------------------------------------------------------
    # 3. Safe Reconciliation & Failure Recovery
    # -------------------------------------------------------------------------

    @classmethod
    def reconcile_shipment(
        cls,
        db: Session,
        shipment_id: str,
        admin_user: Optional[User] = None,
    ) -> Shipment:
        """ADMIN-SHIP-API-003: Safe operational recovery for uncertain shipments.
        
        Queries Shiprocket to verify whether a remote order was actually created
        and whether an AWB is assigned, avoiding duplicate orders and costs.
        """
        try:
            s_uuid = uuid.UUID(shipment_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message="Shipment not found")

        shipment = db.query(Shipment).filter(Shipment.id == s_uuid).first()
        if not shipment:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message="Shipment not found")

        # If already happily assigned and confirmed, reconciliation is done
        if shipment.booking_status == "awb_assigned" and shipment.tracking_number:
            return shipment

        sr_order_id = shipment.shiprocket_order_id
        if not sr_order_id:
            # No remote order ID recorded: booking never reached Shiprocket.
            shipment.booking_status = "booking_failed"
            shipment.reconciliation_notes = "No remote Shiprocket order ID present. Reset to booking_failed for retry."
            shipment.updated_at = utcnow()
            db.commit()
            return shipment

        # Query Shiprocket remote order details
        try:
            remote_order = shiprocket_provider.get_order_details(sr_order_id)
        except ShiprocketError as e:
            logger.error(f"Failed to query remote order {sr_order_id} during reconciliation: {e}")
            shipment.reconciliation_notes = f"Reconciliation query failed: {sanitize_message(str(e))}"
            shipment.updated_at = utcnow()
            db.commit()
            raise APIException(
                status_code=http_status.HTTP_502_BAD_GATEWAY,
                code="RECONCILIATION_QUERY_FAILED",
                message=f"Failed to query carrier during reconciliation: {sanitize_message(str(e))}",
            )

        # Inspect shipments within remote order
        remote_shipments = remote_order.get("shipments") or []
        if isinstance(remote_shipments, list) and remote_shipments:
            first_ship = remote_shipments[0]
            awb = first_ship.get("awb")
            courier = first_ship.get("courier") or first_ship.get("courier_name")
            sr_ship_id = first_ship.get("id") or first_ship.get("shipment_id")

            if sr_ship_id and not shipment.shiprocket_shipment_id:
                shipment.shiprocket_shipment_id = str(sr_ship_id)

            if awb:
                shipment.tracking_number = str(awb)
                shipment.carrier = str(courier) if courier else shipment.carrier
                shipment.booking_status = "awb_assigned"
                shipment.status = "created"
                shipment.reconciliation_notes = "Successfully reconciled: confirmed existing remote order and AWB."
                shipment.updated_at = utcnow()
                db.commit()
                return shipment

        # Remote order exists, but no AWB assigned yet
        shipment.booking_status = "awb_pending"
        shipment.reconciliation_notes = "Remote order confirmed, awaiting AWB assignment."
        shipment.updated_at = utcnow()
        db.commit()
        return shipment

    @classmethod
    def assign_shipment_awb(
        cls,
        db: Session,
        shipment_id: str,
        courier_id: Optional[int] = None,
        admin_user: Optional[User] = None,
    ) -> Shipment:
        """ADMIN-SHIP-API-004: Explicitly assign courier and retrieve AWB for an awb_pending shipment."""
        try:
            s_uuid = uuid.UUID(shipment_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message="Shipment not found")

        shipment = db.query(Shipment).filter(Shipment.id == s_uuid).first()
        if not shipment:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message="Shipment not found")

        if not shipment.shiprocket_shipment_id:
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="MISSING_SHIPMENT_ID",
                message="Cannot assign AWB without Shiprocket shipment ID. Run reconciliation first.",
            )

        try:
            res = shiprocket_provider.assign_awb(shipment.shiprocket_shipment_id, courier_id=courier_id)
            shipment.tracking_number = res["awb_code"]
            shipment.carrier = res.get("courier_name") or shipment.carrier
            shipment.courier_company_id = res.get("courier_company_id")
            shipment.booking_status = "awb_assigned"
            shipment.status = "created"
            shipment.last_booking_error = None
            shipment.updated_at = utcnow()
            db.commit()

            user_id = None
            if shipment.order:
                user_id = shipment.order.user_id
            elif shipment.manufacturing_request:
                user_id = shipment.manufacturing_request.user_id

            if user_id:
                NotificationService.notify_shipment_update(db, user_id, f"{shipment.tracking_number} (ready_to_ship)")

            return shipment
        except ShiprocketError as e:
            logger.error(f"Explicit AWB assignment failed for shipment {shipment_id}: {e}")
            shipment.last_booking_error = sanitize_message(str(e))
            shipment.updated_at = utcnow()
            db.commit()
            raise APIException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                code="AWB_ASSIGNMENT_FAILED",
                message=f"AWB assignment failed: {sanitize_message(str(e))}",
            )

    # -------------------------------------------------------------------------
    # 4. Phase 4: Shipping Labels, Pickups & Manifests
    # -------------------------------------------------------------------------

    @classmethod
    def get_or_generate_label(
        cls,
        db: Session,
        shipment_id: str,
        admin_user: Optional[User] = None,
        force_regenerate: bool = False,
    ) -> Dict[str, Any]:
        """ADMIN-SHIP-API-005: Retrieve or generate shipping label URL for an AWB assigned shipment."""
        try:
            s_uuid = uuid.UUID(shipment_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message="Shipment not found")

        shipment = db.query(Shipment).filter(Shipment.id == s_uuid).with_for_update().first()
        if not shipment:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message="Shipment not found")

        # Must have AWB assigned
        if shipment.booking_status != "awb_assigned" and not shipment.tracking_number:
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="AWB_REQUIRED",
                message="Cannot generate shipping label before courier AWB is assigned.",
            )

        # Idempotent return if already generated and force_regenerate is False
        if shipment.label_url and shipment.label_status == "generated" and not force_regenerate:
            return {
                "shipment_id": str(shipment.id),
                "label_url": shipment.label_url,
                "label_status": shipment.label_status,
                "label_generated_at": shipment.label_generated_at.isoformat() if shipment.label_generated_at else None,
            }

        target_ref = shipment.shiprocket_shipment_id or shipment.tracking_number or str(shipment.id)

        try:
            res = shiprocket_provider.generate_label(target_ref)
            shipment.label_url = res["label_url"]
            shipment.label_status = "generated"
            shipment.label_generated_at = utcnow()
            shipment.last_operation_error = None
            shipment.updated_at = utcnow()

            if admin_user:
                audit = AuditEvent(
                    id=uuid.uuid4(),
                    user_id=admin_user.id,
                    action="GENERATE_SHIPPING_LABEL",
                    resource_type="shipment",
                    resource_id=str(shipment.id),
                    details=json.dumps({"shipment_id": str(shipment.id), "label_url": shipment.label_url}),
                    created_at=utcnow(),
                )
                db.add(audit)

            db.commit()
            db.refresh(shipment)
            return {
                "shipment_id": str(shipment.id),
                "label_url": shipment.label_url,
                "label_status": shipment.label_status,
                "label_generated_at": shipment.label_generated_at.isoformat() if shipment.label_generated_at else None,
            }
        except ShiprocketError as e:
            logger.error(f"Failed to generate shipping label for shipment {shipment_id}: {e}")
            shipment.label_status = "failed"
            shipment.last_operation_error = sanitize_message(str(e))
            shipment.updated_at = utcnow()
            db.commit()
            raise APIException(
                status_code=http_status.HTTP_502_BAD_GATEWAY,
                code="LABEL_GENERATION_FAILED",
                message=f"Failed to generate shipping label: {sanitize_message(str(e))}",
            )

    @classmethod
    def schedule_shipment_pickup(
        cls,
        db: Session,
        shipment_id: str,
        pickup_date: Optional[str] = None,
        admin_user: Optional[User] = None,
    ) -> Dict[str, Any]:
        """ADMIN-SHIP-API-006: Schedule courier pickup for an AWB assigned shipment.
        
        Note: Scheduling a pickup does NOT mark the order as 'shipped'. The order
        remains in 'ready_to_ship' until the carrier physically scans and picks up the parcel.
        """
        try:
            s_uuid = uuid.UUID(shipment_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message="Shipment not found")

        shipment = db.query(Shipment).filter(Shipment.id == s_uuid).with_for_update().first()
        if not shipment:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message="Shipment not found")

        # Must have AWB assigned
        if shipment.booking_status != "awb_assigned" and not shipment.tracking_number:
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="AWB_REQUIRED",
                message="Cannot schedule pickup before courier AWB is assigned.",
            )

        # Idempotent return if already scheduled
        if shipment.pickup_token_number and shipment.pickup_status == "scheduled":
            return {
                "shipment_id": str(shipment.id),
                "pickup_token_number": shipment.pickup_token_number,
                "pickup_scheduled_date": shipment.pickup_scheduled_date.isoformat() if shipment.pickup_scheduled_date else None,
                "pickup_status": shipment.pickup_status,
                "pickup_generated_at": shipment.pickup_generated_at.isoformat() if shipment.pickup_generated_at else None,
            }

        target_ref = shipment.shiprocket_shipment_id or shipment.tracking_number or str(shipment.id)

        try:
            res = shiprocket_provider.schedule_pickup(target_ref, pickup_date=pickup_date)
            shipment.pickup_token_number = res["pickup_token_number"]
            
            raw_date = res.get("pickup_scheduled_date")
            parsed_dt = None
            if raw_date:
                if isinstance(raw_date, datetime):
                    parsed_dt = raw_date
                elif isinstance(raw_date, str):
                    try:
                        parsed_dt = datetime.fromisoformat(raw_date)
                    except Exception:
                        try:
                            parsed_dt = datetime.strptime(raw_date, "%Y-%m-%d %H:%M:%S")
                        except Exception:
                            try:
                                parsed_dt = datetime.strptime(raw_date, "%Y-%m-%d")
                            except Exception:
                                parsed_dt = utcnow()
            shipment.pickup_scheduled_date = parsed_dt or utcnow()
            shipment.pickup_status = "scheduled"
            shipment.pickup_generated_at = utcnow()
            shipment.last_operation_error = None
            shipment.updated_at = utcnow()

            # Invariant: Never prematurely advance order to 'shipped' here.
            # Order remains 'ready_to_ship'.

            if admin_user:
                audit = AuditEvent(
                    id=uuid.uuid4(),
                    user_id=admin_user.id,
                    action="SCHEDULE_SHIPMENT_PICKUP",
                    resource_type="shipment",
                    resource_id=str(shipment.id),
                    details=json.dumps({
                        "shipment_id": str(shipment.id),
                        "pickup_token_number": shipment.pickup_token_number,
                        "pickup_scheduled_date": shipment.pickup_scheduled_date.isoformat() if shipment.pickup_scheduled_date else None,
                    }),
                    created_at=utcnow(),
                )
                db.add(audit)

            db.commit()
            db.refresh(shipment)
            return {
                "shipment_id": str(shipment.id),
                "pickup_token_number": shipment.pickup_token_number,
                "pickup_scheduled_date": shipment.pickup_scheduled_date.isoformat() if shipment.pickup_scheduled_date else None,
                "pickup_status": shipment.pickup_status,
                "pickup_generated_at": shipment.pickup_generated_at.isoformat() if shipment.pickup_generated_at else None,
            }
        except ShiprocketError as e:
            logger.error(f"Failed to schedule pickup for shipment {shipment_id}: {e}")
            shipment.pickup_status = "failed"
            shipment.last_operation_error = sanitize_message(str(e))
            shipment.updated_at = utcnow()
            db.commit()
            raise APIException(
                status_code=http_status.HTTP_502_BAD_GATEWAY,
                code="PICKUP_SCHEDULING_FAILED",
                message=f"Failed to schedule courier pickup: {sanitize_message(str(e))}",
            )

    @classmethod
    def generate_manifest(
        cls,
        db: Session,
        shipment_ids: List[str],
        admin_user: Optional[User] = None,
    ) -> Dict[str, Any]:
        """ADMIN-SHIP-API-007: Generate shipping manifest for one or more AWB assigned shipments."""
        if not shipment_ids:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="EMPTY_SHIPMENT_LIST",
                message="At least one shipment ID must be provided to generate a manifest.",
            )

        resolved_shipments: List[Shipment] = []
        sr_shipment_ids: List[str] = []

        for sid in shipment_ids:
            try:
                s_uuid = uuid.UUID(sid)
            except ValueError:
                raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message=f"Shipment {sid} not found")

            ship = db.query(Shipment).filter(Shipment.id == s_uuid).first()
            if not ship:
                raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message=f"Shipment {sid} not found")

            if ship.booking_status != "awb_assigned" and not ship.tracking_number:
                raise APIException(
                    status_code=http_status.HTTP_409_CONFLICT,
                    code="AWB_REQUIRED",
                    message=f"Shipment {sid} does not have an assigned AWB, manifest cannot be generated.",
                )

            resolved_shipments.append(ship)
            target_ref = ship.shiprocket_shipment_id or ship.tracking_number or str(ship.id)
            sr_shipment_ids.append(target_ref)

        try:
            res = shiprocket_provider.generate_manifest(sr_shipment_ids)
            manifest_url = res["manifest_url"]
            now = utcnow()

            for ship in resolved_shipments:
                ship.manifest_url = manifest_url
                ship.manifest_status = "generated"
                ship.manifest_generated_at = now
                ship.last_operation_error = None
                ship.updated_at = now

            manifest_record = ShippingManifest(
                id=uuid.uuid4(),
                manifest_url=manifest_url,
                shipment_ids=json.dumps([str(s.id) for s in resolved_shipments]),
                order_ids=json.dumps([str(s.shiprocket_order_id) for s in resolved_shipments if s.shiprocket_order_id]),
                status="generated",
                created_at=now,
            )
            db.add(manifest_record)

            if admin_user:
                audit = AuditEvent(
                    id=uuid.uuid4(),
                    user_id=admin_user.id,
                    action="GENERATE_SHIPPING_MANIFEST",
                    resource_type="shipping_manifest",
                    resource_id=str(manifest_record.id),
                    details=json.dumps({
                        "manifest_id": str(manifest_record.id),
                        "manifest_url": manifest_url,
                        "shipment_count": len(resolved_shipments),
                    }),
                    created_at=now,
                )
                db.add(audit)

            db.commit()
            return {
                "manifest_id": str(manifest_record.id),
                "manifest_url": manifest_url,
                "manifest_status": "generated",
                "manifest_type": "batch" if len(resolved_shipments) > 1 else "single",
                "shipment_ids": [str(s.id) for s in resolved_shipments],
                "created_at": manifest_record.created_at.isoformat() if manifest_record.created_at else None,
            }
        except ShiprocketError as e:
            logger.error(f"Failed to generate manifest for shipments {shipment_ids}: {e}")
            for ship in resolved_shipments:
                ship.manifest_status = "failed"
                ship.last_operation_error = sanitize_message(str(e))
                ship.updated_at = utcnow()
            db.commit()
            raise APIException(
                status_code=http_status.HTTP_502_BAD_GATEWAY,
                code="MANIFEST_GENERATION_FAILED",
                message=f"Failed to generate shipping manifest: {sanitize_message(str(e))}",
            )

    @classmethod
    def get_manifest(
        cls,
        db: Session,
        shipment_id: str,
        admin_user: Optional[User] = None,
    ) -> Dict[str, Any]:
        """ADMIN-SHIP-API-008: Retrieve manifest URL for a specific shipment (generating if needed)."""
        try:
            s_uuid = uuid.UUID(shipment_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message="Shipment not found")

        shipment = db.query(Shipment).filter(Shipment.id == s_uuid).first()
        if not shipment:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message="Shipment not found")

        if shipment.manifest_url and shipment.manifest_status == "generated":
            return {
                "shipment_id": str(shipment.id),
                "manifest_url": shipment.manifest_url,
                "manifest_status": shipment.manifest_status,
                "manifest_generated_at": shipment.manifest_generated_at.isoformat() if shipment.manifest_generated_at else None,
            }

        # Otherwise generate
        gen_res = cls.generate_manifest(db, [shipment_id], admin_user=admin_user)
        return {
            "shipment_id": str(shipment.id),
            "manifest_url": gen_res["manifest_url"],
            "manifest_status": "generated",
            "manifest_generated_at": gen_res.get("created_at"),
        }

    # -------------------------------------------------------------------------
    # 5. Phase 5: Tracking State Machine & Invariant Transitions
    # -------------------------------------------------------------------------

    @classmethod
    def apply_tracking_update(
        cls,
        db: Session,
        shipment: Shipment,
        raw_status: Optional[str] = None,
        carrier: Optional[str] = None,
        edd: Optional[datetime] = None,
        scans: Optional[List[Dict[str, Any]]] = None,
        provider_timestamp: Optional[datetime] = None,
        source: str = "webhook",
    ) -> Dict[str, Any]:
        """Monotonic tracking update state machine preserving invariant progression.
        
        Rules:
        - Normalizes raw carrier status into canonical vocabulary.
        - Persists raw status in raw_carrier_status.
        - Protects terminal states (delivered, returned, cancelled) against non-terminal regression.
        - Detects and flags conflicting terminal states in tracking_exception_notes.
        - Enforces monotonic forward rank progression for non-terminal statuses.
        - Persists discrete scan activities into ShipmentTrackingEvent deduplicating identical scans.
        - Synchronizes parent Order status (ready_to_ship -> shipped on in_transit/out_for_delivery, delivered on delivered).
        - Synchronizes ManufacturingRequest status (delivered on delivered).
        - Idempotently notifies customer on genuine status change or delivery milestone.
        """
        now = utcnow()
        normalized_status = normalize_tracking_status(raw_status) if raw_status else (shipment.status or "created")
        current_status = shipment.status or "created"

        # Update metadata
        shipment.last_tracking_synced_at = now
        if raw_status:
            shipment.raw_carrier_status = str(raw_status)[:100]
        if carrier:
            shipment.carrier = carrier
        if edd:
            shipment.estimated_delivery = edd

        status_transitioned = False
        target_status = current_status

        # 1. Terminal state protection
        if current_status in TERMINAL_TRACKING_STATES:
            if normalized_status in TERMINAL_TRACKING_STATES:
                if normalized_status != current_status:
                    conflict_note = f"[{now.isoformat()}] Conflicting terminal status '{normalized_status}' received via {source} while shipment is '{current_status}'"
                    logger.warning(f"Shipment {shipment.id}: {conflict_note}")
                    shipment.tracking_exception_notes = f"{shipment.tracking_exception_notes}\n{conflict_note}".strip() if shipment.tracking_exception_notes else conflict_note
            else:
                logger.info(
                    f"Shipment {shipment.id}: Ignoring non-terminal status regression '{normalized_status}' via {source} as shipment is already in terminal state '{current_status}'"
                )
        else:
            # 2. State transition graph and monotonic forward progression
            allowed_next = ALLOWED_TRACKING_TRANSITIONS.get(current_status, set())
            current_rank = TRACKING_STATUS_RANKS.get(current_status, 0)
            new_rank = TRACKING_STATUS_RANKS.get(normalized_status, 0)

            # Out-of-order lower rank scan is never a valid advancement
            if new_rank < current_rank and normalized_status not in TERMINAL_TRACKING_STATES:
                is_valid_transition = False
            else:
                is_valid_transition = (normalized_status in allowed_next) or (
                    normalized_status in TERMINAL_TRACKING_STATES or new_rank >= current_rank
                )

            if is_valid_transition:
                if normalized_status != current_status:
                    logger.info(f"Shipment {shipment.id} status advancing: {current_status} -> {normalized_status} (via {source})")
                    shipment.status = normalized_status
                    shipment.updated_at = now
                    status_transitioned = True
                    target_status = normalized_status
            else:
                logger.info(
                    f"Shipment {shipment.id}: Ignoring out-of-order status regression from {current_status} (rank {current_rank}) to {normalized_status} (rank {new_rank})"
                )

        # 3. Persist scan events
        inserted_scans = 0
        if scans and shipment.tracking_number:
            for s in scans:
                s_raw = s.get("status") or s.get("raw_status") or raw_status
                s_norm = normalize_tracking_status(s_raw) if s_raw else normalized_status
                s_activity = s.get("activity") or s.get("description") or ""
                s_loc = s.get("location") or s.get("city") or None
                s_carrier = s.get("carrier") or carrier or shipment.carrier
                s_time = parse_carrier_timestamp(s.get("date") or s.get("timestamp") or s.get("occurred_at")) or provider_timestamp or now

                # Deduplicate scan: match shipment_id, tracking_number, status, activity, and occurred_at
                existing_scan = db.query(ShipmentTrackingEvent).filter(
                    ShipmentTrackingEvent.shipment_id == shipment.id,
                    ShipmentTrackingEvent.status == s_norm,
                    ShipmentTrackingEvent.occurred_at == s_time,
                    ShipmentTrackingEvent.activity == s_activity,
                ).first()

                if not existing_scan:
                    event_row = ShipmentTrackingEvent(
                        id=uuid.uuid4(),
                        shipment_id=shipment.id,
                        tracking_number=shipment.tracking_number,
                        status=s_norm,
                        raw_status=str(s_raw)[:100] if s_raw else None,
                        activity=s_activity,
                        location=s_loc,
                        carrier=s_carrier,
                        occurred_at=s_time,
                        created_at=now,
                    )
                    db.add(event_row)
                    inserted_scans += 1
        elif status_transitioned and shipment.tracking_number:
            # Create a single tracking event for this transition if no scan list was passed
            event_row = ShipmentTrackingEvent(
                id=uuid.uuid4(),
                shipment_id=shipment.id,
                tracking_number=shipment.tracking_number,
                status=target_status,
                raw_status=str(raw_status)[:100] if raw_status else None,
                activity=f"Shipment updated to {target_status}",
                location=None,
                carrier=shipment.carrier,
                occurred_at=provider_timestamp or now,
                created_at=now,
            )
            db.add(event_row)
            inserted_scans += 1

        # 4. Synchronize Parent Order
        if shipment.order_id:
            order = db.query(Order).filter(Order.id == shipment.order_id).first()
            if order:
                if target_status == "delivered":
                    if order.status != "delivered":
                        order.status = "delivered"
                        order.updated_at = now
                        NotificationService.notify_status_change(db, order.user_id, "Order", "delivered", ref_id=order.order_number)
                elif target_status in ("in_transit", "out_for_delivery"):
                    if order.status in ("paid", "processing", "ready_to_ship"):
                        order.status = "shipped"
                        order.updated_at = now
                        NotificationService.notify_status_change(db, order.user_id, "Order", "shipped", ref_id=order.order_number)

        # 5. Synchronize Manufacturing Deliverable
        if shipment.manufacturing_request_id:
            mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == shipment.manufacturing_request_id).first()
            if mfg:
                if target_status == "delivered":
                    if mfg.status != "delivered":
                        mfg.status = "delivered"
                        mfg.updated_at = now
                        NotificationService.notify_status_change(db, mfg.user_id, "Manufacturing Request", "delivered")

        # 6. Customer tracking notification on status transition
        if status_transitioned and shipment.tracking_number:
            user_id = None
            if shipment.order:
                user_id = shipment.order.user_id
            elif shipment.manufacturing_request:
                user_id = shipment.manufacturing_request.user_id
            if user_id:
                NotificationService.notify_shipment_update(db, user_id, f"{shipment.tracking_number} ({target_status})")

        return {
            "shipment_id": str(shipment.id),
            "status": shipment.status,
            "raw_status": shipment.raw_carrier_status,
            "status_transitioned": status_transitioned,
            "inserted_scans": inserted_scans,
            "last_tracking_synced_at": shipment.last_tracking_synced_at.isoformat() if shipment.last_tracking_synced_at else None,
        }

    @classmethod
    def process_webhook_inbox_event(cls, db: Session, inbox_id: str) -> Dict[str, Any]:
        """Durable webhook event processor invoked asynchronously by Celery or fallback."""
        try:
            i_uuid = uuid.UUID(inbox_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="INBOX_NOT_FOUND", message="Webhook inbox record not found")

        inbox = db.query(ShippingWebhookInbox).filter(ShippingWebhookInbox.id == i_uuid).with_for_update().first()
        if not inbox:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="INBOX_NOT_FOUND", message="Webhook inbox record not found")

        if inbox.status == "processed":
            return {"status": "already_processed", "inbox_id": str(inbox.id)}

        inbox.attempts += 1
        now = utcnow()

        try:
            payload = json.loads(inbox.payload_json) if inbox.payload_json else {}
            awb = payload.get("awb") or payload.get("tracking_number") or ""
            current_status = payload.get("current_status") or payload.get("status") or ""
            courier = payload.get("courier_name") or payload.get("carrier")
            etd_raw = payload.get("etd") or payload.get("edd")
            edd = parse_carrier_timestamp(etd_raw) if etd_raw else None
            provider_time = parse_carrier_timestamp(payload.get("current_timestamp") or payload.get("occurred_at"))
            scans = payload.get("scans") or payload.get("shipment_track_activities") or []

            # Locate shipment
            shipment = None
            if awb:
                shipment = db.query(Shipment).filter(Shipment.tracking_number == awb).with_for_update().first()
            if not shipment and payload.get("order_id"):
                shipment = db.query(Shipment).filter(Shipment.shiprocket_order_id == str(payload["order_id"])).with_for_update().first()
            if not shipment and inbox.shipment_id:
                shipment = db.query(Shipment).filter(Shipment.id == inbox.shipment_id).with_for_update().first()

            if not shipment:
                logger.warning(f"Webhook inbox {inbox.id}: No matching shipment found for AWB='{awb}', order_id='{payload.get('order_id')}'")
                inbox.status = "unmatched"
                inbox.last_error = f"No matching shipment found for AWB {awb}"
                inbox.processed_at = now
                db.commit()
                return {"status": "unmatched", "inbox_id": str(inbox.id)}

            inbox.shipment_id = shipment.id

            # Apply tracking update through the state machine
            res = cls.apply_tracking_update(
                db=db,
                shipment=shipment,
                raw_status=current_status,
                carrier=courier,
                edd=edd,
                scans=scans,
                provider_timestamp=provider_time,
                source="webhook",
            )

            inbox.status = "processed"
            inbox.last_error = None
            inbox.processed_at = now
            db.commit()
            return {"status": "processed", "inbox_id": str(inbox.id), "result": res}
        except Exception as e:
            db.rollback()
            failed_inbox = db.query(ShippingWebhookInbox).filter(ShippingWebhookInbox.id == i_uuid).first()
            if failed_inbox:
                failed_inbox.status = "failed"
                failed_inbox.last_error = sanitize_message(str(e))
                db.commit()
            logger.error(f"Failed processing shipping webhook inbox {inbox_id}: {e}")
            raise

    @classmethod
    def sync_shipment_tracking(
        cls,
        db: Session,
        shipment_id: str,
        admin_user: Optional[User] = None,
    ) -> Dict[str, Any]:
        """Live tracking query integration: queries carrier and synchronizes state machine."""
        try:
            s_uuid = uuid.UUID(shipment_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message="Shipment not found")

        shipment = db.query(Shipment).filter(Shipment.id == s_uuid).with_for_update().first()
        if not shipment:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="SHIPMENT_NOT_FOUND", message="Shipment not found")

        if not shipment.tracking_number:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="AWB_REQUIRED",
                message="Cannot sync tracking for shipment without an assigned AWB / tracking number.",
            )

        now = utcnow()
        try:
            status_data = shiprocket_provider.get_tracking_status(shipment.tracking_number)
        except ShiprocketError as e:
            logger.error(f"Tracking query failed for shipment {shipment_id} (AWB: {shipment.tracking_number}): {e}")
            shipment.last_tracking_synced_at = now
            shipment.tracking_exception_notes = f"[{now.isoformat()}] Carrier sync query failed: {sanitize_message(str(e))}"
            db.commit()
            raise APIException(
                status_code=http_status.HTTP_502_BAD_GATEWAY,
                code="TRACKING_QUERY_FAILED",
                message=f"Failed to query carrier tracking: {sanitize_message(str(e))}",
            )

        is_awaiting_scan = status_data.get("is_awaiting_scan", False)
        if is_awaiting_scan:
            shipment.last_tracking_synced_at = now
            if not shipment.status or shipment.status in ("pending", "created"):
                shipment.status = "ready_to_ship"
            db.commit()
            return {
                "shipment_id": str(shipment.id),
                "tracking_number": shipment.tracking_number,
                "status": shipment.status,
                "is_awaiting_scan": True,
                "message": "Shipment is awaiting carrier pickup and first physical hub scan.",
                "last_tracking_synced_at": shipment.last_tracking_synced_at.isoformat() if shipment.last_tracking_synced_at else None,
            }

        # Real tracking response
        raw_status = status_data.get("raw_status") or status_data.get("status")
        carrier = status_data.get("carrier")
        edd = parse_carrier_timestamp(status_data.get("estimated_delivery"))
        scans = status_data.get("events") or []

        res = cls.apply_tracking_update(
            db=db,
            shipment=shipment,
            raw_status=raw_status,
            carrier=carrier,
            edd=edd,
            scans=scans,
            source="manual_sync" if admin_user else "sync_query",
        )

        if admin_user:
            audit = AuditEvent(
                id=uuid.uuid4(),
                user_id=admin_user.id,
                action="MANUAL_TRACKING_SYNC",
                resource_type="shipment",
                resource_id=str(shipment.id),
                details=json.dumps({"shipment_id": str(shipment.id), "status": shipment.status, "tracking_number": shipment.tracking_number}),
                created_at=now,
            )
            db.add(audit)

        db.commit()
        db.refresh(shipment)
        return {
            "shipment_id": str(shipment.id),
            "tracking_number": shipment.tracking_number,
            "status": shipment.status,
            "is_awaiting_scan": False,
            "result": res,
            "last_tracking_synced_at": shipment.last_tracking_synced_at.isoformat() if shipment.last_tracking_synced_at else None,
        }

    @classmethod
    def list_shipping_exceptions(
        cls,
        db: Session,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """Admin dashboard: List shipments with operational exceptions, delays, or conflicting states."""
        from datetime import timedelta
        now = utcnow()
        stale_threshold = now - timedelta(hours=48)

        # Exceptions criteria:
        # 1. reconciliation_required booking status
        # 2. Conflicting tracking exception notes
        # 3. RTO / returned shipments
        # 4. Awaiting scan / pickup > 48h after AWB assignment
        query = db.query(Shipment).filter(
            (Shipment.booking_status == "reconciliation_required") |
            (Shipment.tracking_exception_notes.isnot(None)) |
            (Shipment.status.in_(["rto_initiated", "returned", "cancelled"])) |
            ((Shipment.status == "ready_to_ship") & (Shipment.booking_status == "awb_assigned") & (Shipment.created_at < stale_threshold))
        ).order_by(Shipment.updated_at.desc())

        total = query.count()
        shipments = query.offset((page - 1) * page_size).limit(page_size).all()

        items = []
        for s in shipments:
            exception_type = "general_exception"
            if s.tracking_exception_notes:
                exception_type = "tracking_conflict_or_error"
            elif s.booking_status == "reconciliation_required":
                exception_type = "booking_uncertain"
            elif s.status in ("rto_initiated", "returned"):
                exception_type = "return_to_origin"
            elif s.status == "ready_to_ship" and s.created_at and s.created_at < stale_threshold:
                exception_type = "pickup_stale_over_48h"

            items.append({
                "id": str(s.id),
                "order_id": str(s.order_id) if s.order_id else None,
                "manufacturing_request_id": str(s.manufacturing_request_id) if s.manufacturing_request_id else None,
                "carrier": s.carrier,
                "tracking_number": s.tracking_number,
                "status": s.status,
                "booking_status": s.booking_status,
                "exception_type": exception_type,
                "tracking_exception_notes": s.tracking_exception_notes,
                "last_operation_error": s.last_operation_error or s.last_booking_error,
                "last_tracking_synced_at": s.last_tracking_synced_at.isoformat() if s.last_tracking_synced_at else None,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            })

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    @classmethod
    def list_webhook_inbox(
        cls,
        db: Session,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """Admin dashboard: List durable webhook inbox events for audit and diagnostic inspection."""
        query = db.query(ShippingWebhookInbox)
        if status:
            query = query.filter(ShippingWebhookInbox.status == status.lower())
        query = query.order_by(ShippingWebhookInbox.received_at.desc())

        total = query.count()
        events = query.offset((page - 1) * page_size).limit(page_size).all()

        items = []
        for e in events:
            items.append({
                "id": str(e.id),
                "event_id": e.event_id,
                "provider": e.provider,
                "shipment_id": str(e.shipment_id) if e.shipment_id else None,
                "event_type": e.event_type,
                "status": e.status,
                "attempts": e.attempts,
                "last_error": e.last_error,
                "provider_timestamp": e.provider_timestamp.isoformat() if e.provider_timestamp else None,
                "received_at": e.received_at.isoformat() if e.received_at else None,
                "processed_at": e.processed_at.isoformat() if e.processed_at else None,
            })

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    @classmethod
    def retry_webhook_inbox_event(
        cls,
        db: Session,
        inbox_id: str,
        admin_user: Optional[User] = None,
    ) -> Dict[str, Any]:
        """Admin operation: Manually re-trigger processing of a failed or pending webhook event."""
        res = cls.process_webhook_inbox_event(db, inbox_id)
        if admin_user:
            audit = AuditEvent(
                id=uuid.uuid4(),
                user_id=admin_user.id,
                action="RETRY_SHIPPING_WEBHOOK",
                resource_type="shipping_webhook_inbox",
                resource_id=inbox_id,
                details=json.dumps({"inbox_id": inbox_id, "result": res}),
                created_at=utcnow(),
            )
            db.add(audit)
            db.commit()
        return res


