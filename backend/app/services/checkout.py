from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import select
from fastapi import status as http_status

from app.models.user import User, Address
from app.models.order import Cart, CartItem, CheckoutSession
from app.models.catalog import Product, Inventory, InventoryReservation
from app.services.catalog import _rupees, _paise
from app.services.tax import calculate_gst, TaxService, TaxPricingMode
from app.integrations.shiprocket import shiprocket_provider
from app.core.exceptions import APIException

RESERVATION_DURATION_MINUTES = 15

def utcnow():
    return datetime.now(timezone.utc)

def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

def _serialize_checkout_session(
    session: CheckoutSession,
    items_snapshot: Optional[List[Dict[str, Any]]] = None,
    address: Optional[Address] = None,
) -> Dict[str, Any]:
    now = utcnow()
    exp_at = _as_utc(session.reservation_expires_at)
    is_expired = session.status == "expired" or (exp_at is not None and exp_at < now)

    if is_expired:
        return {
            "checkout_session_id": str(session.id),
            "status": "expired",
            "items": None,
            "address": None,
            "reservation_expires_at": exp_at.isoformat() if exp_at else None,
            "shipping": None,
            "tax": None,
            "subtotal": None,
            "total": None,
        }


    addr = address or session.address
    addr_data = None
    if addr:
        addr_data = {
            "id": str(addr.id),
            "recipient_name": addr.recipient_name,
            "phone": addr.phone,
            "line1": addr.line1,
            "line2": addr.line2,
            "city": addr.city,
            "state": addr.state,
            "pincode": addr.pincode,
            "country": addr.country,
        }

    # Build items snapshot if not provided
    if items_snapshot is None and session.cart:
        items_snapshot = []
        for it in session.cart.items:
            prod = it.product
            if prod:
                items_snapshot.append({
                    "product_id": str(prod.id),
                    "name": prod.name,
                    "quantity": it.quantity,
                    "unit_price": _rupees(prod.price_paise),
                })

    is_inclusive = session.total_paise == (session.subtotal_paise + session.shipping_rate_paise)
    taxable_paise = (session.subtotal_paise - session.tax_amount_paise) if is_inclusive else session.subtotal_paise
    tax_data = {
        "type": session.tax_type,
        "amount": _rupees(session.tax_amount_paise),
        "taxable_amount": _rupees(taxable_paise),
        "cgst_amount": _rupees(session.cgst_amount_paise) if session.cgst_amount_paise is not None else None,
        "sgst_amount": _rupees(session.sgst_amount_paise) if session.sgst_amount_paise is not None else None,
        "igst_amount": _rupees(session.igst_amount_paise) if session.igst_amount_paise is not None else None,
        "pricing_mode": "TAX_INCLUSIVE" if is_inclusive else "TAX_EXCLUSIVE",
    }

    shipping_data = {
        "rate": _rupees(session.shipping_rate_paise),
        "eta_days_min": session.shipping_eta_min_days,
        "eta_days_max": session.shipping_eta_max_days,
        "eta_description": f"Arrives in {session.shipping_eta_min_days}–{session.shipping_eta_max_days} days",
    }

    return {
        "checkout_session_id": str(session.id),
        "status": session.status,
        "items": items_snapshot,
        "address": addr_data,
        "reservation_expires_at": session.reservation_expires_at.isoformat() if session.reservation_expires_at else None,
        "shipping": shipping_data,
        "tax": tax_data,
        "subtotal": _rupees(session.subtotal_paise),
        "total": _rupees(session.total_paise),
    }


def create_checkout_session(db: Session, user: User, address_id: str) -> Dict[str, Any]:
    """CHECKOUT-API-001:
    1. Verify customer status == 'verified' (CHK-001)
    2. Retrieve customer's cart, reject if empty (400)
    3. Verify address ownership, reject 404 if not found/owned
    4. Authoritative address serviceability check, reject 422 if unserviceable (CHK-002, ADDR-002)
    5. Check for existing unexpired session (idempotency)
    6. Row-lock inventory rows, perform hard stock check (all-or-nothing, 409 if any fails)
    7. Calculate current authoritative prices, shipping, tax
    8. Create InventoryReservation rows (expires_at = now + 15m)
    9. Create CheckoutSession
    """
    # 1. Verification check
    if user.status != "verified":
        raise APIException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            code="UNVERIFIED_ACCOUNT",
            message="Verified email required to proceed to checkout",
        )

    # 2. Cart check
    cart = db.query(Cart).filter(Cart.user_id == user.id).first()
    if not cart or not cart.items or len(cart.items) == 0:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="EMPTY_CART",
            message="Cannot checkout with an empty cart",
        )

    # 3. Address ownership
    try:
        a_uuid = uuid.UUID(address_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="ADDRESS_NOT_FOUND",
            message="Shipping address not found",
        )

    address = db.query(Address).filter(Address.id == a_uuid, Address.user_id == user.id).first()
    if not address:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="ADDRESS_NOT_FOUND",
            message="Shipping address not found",
        )

    # 4. Authoritative serviceability check
    is_serviceable = shiprocket_provider.check_serviceability(address.pincode)
    if not is_serviceable:
        raise APIException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="ADDRESS_UNSERVICEABLE",
            message=f"PIN code {address.pincode} is currently unserviceable for delivery",
        )

    now = utcnow()

    # 5. Idempotency: check if an active unexpired session already exists for this cart
    existing_session = (
        db.query(CheckoutSession)
        .filter(
            CheckoutSession.user_id == user.id,
            CheckoutSession.cart_id == cart.id,
            CheckoutSession.status == "open",
            CheckoutSession.reservation_expires_at > now,
        )
        .first()
    )
    if existing_session:
        return _serialize_checkout_session(existing_session, address=address)

    # 6. Hard stock validation & row-locking
    # Sort product IDs to prevent deadlocks across concurrent checkouts
    cart_items = list(cart.items)
    cart_items.sort(key=lambda item: str(item.product_id))

    product_ids = [item.product_id for item in cart_items]

    # Row-lock inventories
    # Using with_for_update() on dialects that support it (PostgreSQL)
    bind = db.get_bind()
    inv_query = db.query(Inventory).filter(Inventory.product_id.in_(product_ids))
    if bind.dialect.name == "postgresql":
        inv_query = inv_query.with_for_update()

    inventories = {inv.product_id: inv for inv in inv_query.all()}

    insufficient_items = []
    items_snapshot = []
    subtotal_paise = 0
    total_weight_grams = 0

    for item in cart_items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product or product.status != "active":
            insufficient_items.append({
                "product_id": str(item.product_id),
                "name": product.name if product else "Unknown Product",
                "requested": item.quantity,
                "available": 0,
                "reason": "Product is no longer active",
            })
            continue

        inv = inventories.get(item.product_id)
        available = (inv.stock_quantity - inv.reserved_quantity) if inv else 0
        if available < item.quantity:
            insufficient_items.append({
                "product_id": str(item.product_id),
                "name": product.name,
                "requested": item.quantity,
                "available": max(0, available),
                "reason": "Insufficient stock",
            })
        else:
            # Re-read authoritative current catalog price
            unit_paise = product.price_paise
            subtotal_paise += unit_paise * item.quantity
            total_weight_grams += (product.weight_grams or 200) * item.quantity

            items_snapshot.append({
                "product_id": str(product.id),
                "name": product.name,
                "quantity": item.quantity,
                "unit_price": _rupees(unit_paise),
            })

    # All-or-nothing check (INV-006)
    if insufficient_items:
        raise APIException(
            status_code=http_status.HTTP_409_CONFLICT,
            code="INSUFFICIENT_STOCK",
            message="One or more items in your cart do not have sufficient stock",
            details={"insufficient_items": insufficient_items},
        )

    # 7. Calculate Shipping & Tax
    origin_pincode = "500001" # VenopAI Hyderabad warehouse
    shipping_quote = shiprocket_provider.calculate_rate_and_eta(
        origin_pincode=origin_pincode,
        destination_pincode=address.pincode,
        weight_grams=total_weight_grams,
    )
    if not shipping_quote.get("serviceable", True):
        raise APIException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="ADDRESS_UNSERVICEABLE",
            message=f"PIN code {address.pincode} is not serviceable by carrier",
        )

    shipping_rate_paise = shipping_quote["rate_paise"]
    eta_min = shipping_quote["eta_days_min"]
    eta_max = shipping_quote["eta_days_max"]

    tax_calc = TaxService.calculate_tax(
        merchandise_amount_paise=subtotal_paise,
        destination_state=address.state,
        shipping_amount_paise=shipping_rate_paise,
    )
    tax_amount_paise = tax_calc.total_tax_paise

    if tax_calc.pricing_mode == TaxPricingMode.TAX_INCLUSIVE.value:
        total_paise = subtotal_paise + shipping_rate_paise
    else:
        total_paise = subtotal_paise + shipping_rate_paise + tax_amount_paise

    # 8. Create CheckoutSession and reserve stock
    session_id = uuid.uuid4()
    expires_at = now + timedelta(minutes=RESERVATION_DURATION_MINUTES)

    checkout_session = CheckoutSession(
        id=session_id,
        user_id=user.id,
        cart_id=cart.id,
        address_id=address.id,
        status="open",
        subtotal_paise=subtotal_paise,
        shipping_rate_paise=shipping_rate_paise,
        shipping_eta_min_days=eta_min,
        shipping_eta_max_days=eta_max,
        tax_type=tax_calc.tax_type,
        tax_amount_paise=tax_amount_paise,
        cgst_amount_paise=tax_calc.cgst_paise,
        sgst_amount_paise=tax_calc.sgst_paise,
        igst_amount_paise=tax_calc.igst_paise,
        total_paise=total_paise,
        reservation_expires_at=expires_at,
    )
    db.add(checkout_session)

    # Create InventoryReservation for each cart line
    for item in cart_items:
        inv = inventories[item.product_id]
        inv.reserved_quantity += item.quantity

        res = InventoryReservation(
            inventory_id=inv.id,
            checkout_session_id=session_id,
            order_id=None,
            quantity=item.quantity,
            status="ACTIVE",
            created_at=now,
            expires_at=expires_at,
        )
        db.add(res)

    db.commit()
    db.refresh(checkout_session)

    return _serialize_checkout_session(checkout_session, items_snapshot=items_snapshot, address=address)


def get_checkout_session(db: Session, user: User, session_id: str) -> Dict[str, Any]:
    """CHECKOUT-API-002: Fetch session for countdown and status."""
    try:
        s_uuid = uuid.UUID(session_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="SESSION_NOT_FOUND",
            message="Checkout session not found",
        )

    session = (
        db.query(CheckoutSession)
        .filter(CheckoutSession.id == s_uuid, CheckoutSession.user_id == user.id)
        .first()
    )
    if not session:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="SESSION_NOT_FOUND",
            message="Checkout session not found",
        )

    return _serialize_checkout_session(session)


def change_checkout_address(db: Session, user: User, session_id: str, new_address_id: str) -> Dict[str, Any]:
    """CHECKOUT-API-003: Change address on open session.
    - Preserves reservation timer (does not reset)
    - Recalculates shipping and tax
    """
    try:
        s_uuid = uuid.UUID(session_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="SESSION_NOT_FOUND",
            message="Checkout session not found",
        )

    session = (
        db.query(CheckoutSession)
        .filter(CheckoutSession.id == s_uuid, CheckoutSession.user_id == user.id)
        .first()
    )
    if not session:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="SESSION_NOT_FOUND",
            message="Checkout session not found",
        )

    now = utcnow()
    exp_at = _as_utc(session.reservation_expires_at)
    if session.status != "open" or (exp_at and exp_at < now):
        raise APIException(
            status_code=http_status.HTTP_409_CONFLICT,
            code="RESERVATION_EXPIRED",
            message="Checkout reservation has expired",
        )


    try:
        a_uuid = uuid.UUID(new_address_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="ADDRESS_NOT_FOUND",
            message="New address not found",
        )

    new_addr = db.query(Address).filter(Address.id == a_uuid, Address.user_id == user.id).first()
    if not new_addr:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="ADDRESS_NOT_FOUND",
            message="New address not found",
        )

    # Authoritative serviceability check on new address
    is_serviceable = shiprocket_provider.check_serviceability(new_addr.pincode)
    if not is_serviceable:
        raise APIException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="ADDRESS_UNSERVICEABLE",
            message=f"PIN code {new_addr.pincode} is unserviceable",
        )

    # Recalculate shipping & tax
    # Calculate weight from cart items
    total_weight = 0
    if session.cart:
        for it in session.cart.items:
            if it.product:
                total_weight += (it.product.weight_grams or 200) * it.quantity

    origin_pincode = "500001"
    shipping_quote = shiprocket_provider.calculate_rate_and_eta(
        origin_pincode=origin_pincode,
        destination_pincode=new_addr.pincode,
        weight_grams=total_weight,
    )
    shipping_rate_paise = shipping_quote["rate_paise"]

    tax_calc = TaxService.calculate_tax(
        merchandise_amount_paise=session.subtotal_paise,
        destination_state=new_addr.state,
        shipping_amount_paise=shipping_rate_paise,
    )
    tax_amount_paise = tax_calc.total_tax_paise

    session.address_id = new_addr.id
    session.shipping_rate_paise = shipping_rate_paise
    session.shipping_eta_min_days = shipping_quote["eta_days_min"]
    session.shipping_eta_max_days = shipping_quote["eta_days_max"]
    session.tax_type = tax_calc.tax_type
    session.tax_amount_paise = tax_amount_paise
    session.cgst_amount_paise = tax_calc.cgst_paise
    session.sgst_amount_paise = tax_calc.sgst_paise
    session.igst_amount_paise = tax_calc.igst_paise

    if tax_calc.pricing_mode == TaxPricingMode.TAX_INCLUSIVE.value:
        session.total_paise = session.subtotal_paise + shipping_rate_paise
    else:
        session.total_paise = session.subtotal_paise + shipping_rate_paise + tax_amount_paise


    db.commit()
    db.refresh(session)

    return _serialize_checkout_session(session, address=new_addr)


def release_expired_reservations(db: Session) -> int:
    """Scheduled task / service function: finds ACTIVE reservations that have passed expires_at,
    releases reserved stock, marks reservation EXPIRED, and marks CheckoutSession expired.
    """
    now = utcnow()
    expired_reservations = (
        db.query(InventoryReservation)
        .filter(
            InventoryReservation.status == "ACTIVE",
            InventoryReservation.expires_at <= now,
        )
        .all()
    )

    released_count = 0
    expired_sessions = set()

    for res in expired_reservations:
        inv = res.inventory
        if inv:
            inv.reserved_quantity = max(0, inv.reserved_quantity - res.quantity)
        res.status = "EXPIRED"
        res.released_at = now
        released_count += 1
        if res.checkout_session_id:
            expired_sessions.add(res.checkout_session_id)

    if expired_sessions:
        db.query(CheckoutSession).filter(CheckoutSession.id.in_(list(expired_sessions))).update(
            {"status": "expired"}, synchronize_session=False
        )

    db.commit()
    return released_count
