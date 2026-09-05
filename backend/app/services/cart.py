from typing import Optional, Dict, Any
import uuid
from sqlalchemy.orm import Session
from fastapi import status as http_status

from app.models.order import Cart, CartItem
from app.models.catalog import Product, Inventory
from app.models.user import User
from app.services.catalog import _rupees, _parse_json_list
from app.core.exceptions import APIException

def get_or_create_cart(db: Session, user: User) -> Cart:
    """CART-003: Single persistent cart per customer across sessions."""
    cart = db.query(Cart).filter(Cart.user_id == user.id).first()
    if not cart:
        cart = Cart(user_id=user.id)
        db.add(cart)
        db.commit()
        db.refresh(cart)
    return cart


def build_cart_response_data(cart: Cart) -> Dict[str, Any]:
    """Calculate authoritative prices in paise and format to rupees.
    Applies CART-002 soft stock check without blocking.
    """
    items_data = []
    subtotal_paise = 0

    for item in cart.items:
        product = item.product
        if not product:
            continue

        unit_paise = product.price_paise
        line_paise = unit_paise * item.quantity
        subtotal_paise += line_paise

        # CART-002: Soft availability check
        stock_warning = False
        if product.inventory:
            available = product.inventory.stock_quantity - product.inventory.reserved_quantity
            if item.quantity > available:
                stock_warning = True
        else:
            stock_warning = True

        images = _parse_json_list(product.images)
        primary_image = images[0] if images else None

        items_data.append({
            "id": str(item.id),
            "product_id": str(product.id),
            "name": product.name,
            "unit_price": _rupees(unit_paise),
            "quantity": item.quantity,
            "line_total": _rupees(line_paise),
            "stock_warning": stock_warning,
            "image_url": primary_image,
        })

    return {
        "id": str(cart.id),
        "items": items_data,
        "subtotal": _rupees(subtotal_paise),
        "currency": "INR",
    }


def get_cart_data(db: Session, user: User) -> Dict[str, Any]:
    """CART-API-001: Fetch current cart for customer."""
    cart = get_or_create_cart(db, user)
    return build_cart_response_data(cart)


def add_to_cart(db: Session, user: User, product_id: str, quantity: int) -> Dict[str, Any]:
    """CART-API-002: Add item or increase quantity.
    CART-001: Explicitly does NOT reserve inventory.
    """
    try:
        p_uuid = uuid.UUID(product_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="PRODUCT_NOT_FOUND",
            message="Product not found",
        )

    product = db.query(Product).filter(Product.id == p_uuid).first()
    if not product or product.status != "active":
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="PRODUCT_NOT_FOUND",
            message="Active product not found",
        )

    if quantity < 1:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_QUANTITY",
            message="Quantity must be at least 1",
        )

    cart = get_or_create_cart(db, user)

    # Check if item already in cart
    existing_item = (
        db.query(CartItem)
        .filter(CartItem.cart_id == cart.id, CartItem.product_id == p_uuid)
        .first()
    )

    if existing_item:
        existing_item.quantity += quantity
    else:
        new_item = CartItem(
            cart_id=cart.id,
            product_id=p_uuid,
            quantity=quantity,
        )
        db.add(new_item)

    db.commit()
    db.refresh(cart)
    return build_cart_response_data(cart)


def update_cart_item(db: Session, user: User, item_id: str, quantity: int) -> Dict[str, Any]:
    """CART-API-003: Update line item quantity."""
    try:
        i_uuid = uuid.UUID(item_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="CART_ITEM_NOT_FOUND",
            message="Cart item not found",
        )

    if quantity < 1:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_QUANTITY",
            message="Quantity must be at least 1",
        )

    cart = get_or_create_cart(db, user)

    item = (
        db.query(CartItem)
        .filter(CartItem.id == i_uuid, CartItem.cart_id == cart.id)
        .first()
    )
    if not item:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="CART_ITEM_NOT_FOUND",
            message="Cart item not found in your cart",
        )

    item.quantity = quantity
    db.commit()
    db.refresh(cart)
    return build_cart_response_data(cart)


def remove_cart_item(db: Session, user: User, item_id: str) -> Dict[str, Any]:
    """CART-API-004: Remove a line item."""
    try:
        i_uuid = uuid.UUID(item_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="CART_ITEM_NOT_FOUND",
            message="Cart item not found",
        )

    cart = get_or_create_cart(db, user)

    item = (
        db.query(CartItem)
        .filter(CartItem.id == i_uuid, CartItem.cart_id == cart.id)
        .first()
    )
    if not item:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="CART_ITEM_NOT_FOUND",
            message="Cart item not found in your cart",
        )

    db.delete(item)
    db.commit()
    db.refresh(cart)
    return build_cart_response_data(cart)


def clear_cart(db: Session, user: User) -> Dict[str, Any]:
    """CART-API-005: Clear entire cart."""
    cart = get_or_create_cart(db, user)

    db.query(CartItem).filter(CartItem.cart_id == cart.id).delete()
    db.commit()
    db.refresh(cart)
    return build_cart_response_data(cart)
