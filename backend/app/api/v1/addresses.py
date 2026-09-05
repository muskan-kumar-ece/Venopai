from typing import List
from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser
from app.services import address as address_service
from app.schemas.address import AddressCreate, AddressUpdate, AddressResponse

router = APIRouter()

def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")

# ---------------------------------------------------------------------------
# USER-API-005 — GET /api/v1/addresses
# ---------------------------------------------------------------------------

@router.get("", response_model=dict)
def list_addresses_endpoint(
    request: Request,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """USER-API-005: List the customer's saved addresses."""
    addresses = address_service.list_addresses(db, current_user)
    return {
        "data": addresses,
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# USER-API-006 — POST /api/v1/addresses
# ---------------------------------------------------------------------------

@router.post("", response_model=dict, status_code=201)
def create_address_endpoint(
    request: Request,
    payload: AddressCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """USER-API-006: Add a new address for the customer."""
    address = address_service.create_address(db, current_user, payload.model_dump())
    return {
        "data": address,
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# USER-API-007 — PATCH /api/v1/addresses/{address_id}
# ---------------------------------------------------------------------------

@router.patch("/{address_id}", response_model=dict)
def update_address_endpoint(
    address_id: str,
    request: Request,
    payload: AddressUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """USER-API-007: Edit a customer's address. IDOR returns 404."""
    address = address_service.update_address(
        db, current_user, address_id, payload.model_dump(exclude_unset=True)
    )
    return {
        "data": address,
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# USER-API-008 — DELETE /api/v1/addresses/{address_id}
# ---------------------------------------------------------------------------

@router.delete("/{address_id}", response_model=dict)
def delete_address_endpoint(
    address_id: str,
    request: Request,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """USER-API-008: Remove an address. IDOR returns 404."""
    res = address_service.delete_address(db, current_user, address_id)
    return {
        "data": res,
        "request_id": _request_id(request),
    }
