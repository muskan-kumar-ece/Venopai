from fastapi import APIRouter, Request, Depends, Body
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser
from app.services import cart as cart_service
from app.schemas.cart import CartResponse, CartItemAdd, CartItemUpdate

router = APIRouter()

def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")

# ---------------------------------------------------------------------------
# CART-API-001 — GET /api/v1/cart
# ---------------------------------------------------------------------------

@router.get("", response_model=CartResponse)
def get_cart_endpoint(
    request: Request,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """CART-API-001: Fetch current cart for authenticated customer."""
    data = cart_service.get_cart_data(db, current_user)
    return {
        "data": data,
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# CART-API-002 — POST /api/v1/cart/items
# ---------------------------------------------------------------------------

@router.post("/items", response_model=CartResponse)
def add_cart_item_endpoint(
    request: Request,
    payload: CartItemAdd,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """CART-API-002: Add item to cart or increase quantity if already present.
    CART-001: Explicitly does NOT reserve inventory.
    """
    data = cart_service.add_to_cart(
        db,
        user=current_user,
        product_id=payload.product_id,
        quantity=payload.quantity,
    )
    return {
        "data": data,
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# CART-API-003 — PATCH /api/v1/cart/items/{item_id}
# ---------------------------------------------------------------------------

@router.patch("/items/{item_id}", response_model=CartResponse)
def update_cart_item_endpoint(
    item_id: str,
    request: Request,
    payload: CartItemUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """CART-API-003: Update quantity of a line item."""
    data = cart_service.update_cart_item(
        db,
        user=current_user,
        item_id=item_id,
        quantity=payload.quantity,
    )
    return {
        "data": data,
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# CART-API-004 — DELETE /api/v1/cart/items/{item_id}
# ---------------------------------------------------------------------------

@router.delete("/items/{item_id}", response_model=CartResponse)
def delete_cart_item_endpoint(
    item_id: str,
    request: Request,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """CART-API-004: Remove a line item from the cart."""
    data = cart_service.remove_cart_item(
        db,
        user=current_user,
        item_id=item_id,
    )
    return {
        "data": data,
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# CART-API-005 — DELETE /api/v1/cart
# ---------------------------------------------------------------------------

@router.delete("", response_model=CartResponse)
def clear_cart_endpoint(
    request: Request,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """CART-API-005: Clear the entire cart."""
    data = cart_service.clear_cart(db, current_user)
    return {
        "data": data,
        "request_id": _request_id(request),
    }
