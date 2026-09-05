from fastapi import APIRouter, Request, Depends, Body
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser
from app.services import checkout as checkout_service
from app.schemas.checkout import CheckoutSessionCreate, CheckoutAddressChange, CheckoutSessionResponse

router = APIRouter()

def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")

# ---------------------------------------------------------------------------
# CHECKOUT-API-001 — POST /api/v1/checkout/sessions
# ---------------------------------------------------------------------------

@router.post("/sessions", response_model=CheckoutSessionResponse, status_code=201)
def create_checkout_session_endpoint(
    request: Request,
    payload: CheckoutSessionCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """CHECKOUT-API-001: Begin checkout from current cart.
    Requires verified customer (CHK-001) and serviceable address (CHK-002).
    Row-locks inventory, validates hard stock, reserves inventory for ~15 min (CHK-003, INV-002).
    """
    data = checkout_service.create_checkout_session(
        db,
        user=current_user,
        address_id=payload.address_id,
    )
    return {
        "data": data,
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# CHECKOUT-API-002 — GET /api/v1/checkout/sessions/{session_id}
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}", response_model=CheckoutSessionResponse)
def get_checkout_session_endpoint(
    session_id: str,
    request: Request,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """CHECKOUT-API-002: Fetch session for live countdown and status."""
    data = checkout_service.get_checkout_session(
        db,
        user=current_user,
        session_id=session_id,
    )
    return {
        "data": data,
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# CHECKOUT-API-003 — POST /api/v1/checkout/sessions/{session_id}/address
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/address", response_model=CheckoutSessionResponse)
def change_checkout_address_endpoint(
    session_id: str,
    request: Request,
    payload: CheckoutAddressChange,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """CHECKOUT-API-003: Change address on open session.
    Preserves reservation countdown while recalculating shipping and tax.
    """
    data = checkout_service.change_checkout_address(
        db,
        user=current_user,
        session_id=session_id,
        new_address_id=payload.address_id,
    )
    return {
        "data": data,
        "request_id": _request_id(request),
    }
