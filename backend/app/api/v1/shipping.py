import uuid
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser
from app.integrations.shiprocket.client import ShiprocketProvider
from app.models.order import Shipment, Order

router = APIRouter()
shiprocket_provider = ShiprocketProvider()


@router.get(
    "/serviceability",
    status_code=http_status.HTTP_200_OK,
    summary="SHIP-API-001: Check if a PIN code is serviceable",
)
def check_pincode_serviceability(
    pincode: str = Query(..., description="6-digit Indian PIN code"),
):
    """Check whether destination PIN code is serviceable for physical delivery."""
    clean = pincode.strip()
    is_serviceable = shiprocket_provider.check_serviceability(clean)
    return {
        "data": {
            "pincode": clean,
            "serviceable": is_serviceable,
            "estimated_days_min": 3 if is_serviceable else 0,
            "estimated_days_max": 5 if is_serviceable else 0,
        },
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{shipment_id}",
    status_code=http_status.HTTP_200_OK,
    summary="SHIP-API-002: Normalized shipment detail",
)
def get_shipment_detail(
    shipment_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer fetches normalized shipment details for their own order."""
    try:
        s_uuid = uuid.UUID(shipment_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Shipment not found")

    shipment = (
        db.query(Shipment)
        .join(Order, Shipment.order_id == Order.id)
        .filter(Shipment.id == s_uuid, Order.user_id == current_user.id)
        .first()
    )
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found or unauthorized")

    return {
        "data": {
            "id": str(shipment.id),
            "order_id": str(shipment.order_id),
            "carrier": "Delhivery",
            "tracking_number": shipment.tracking_number,
            "status": shipment.status,
            "created_at": shipment.created_at.isoformat() if shipment.created_at else None,
            "updated_at": shipment.updated_at.isoformat() if shipment.updated_at else None,
        },
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{shipment_id}/tracking",
    status_code=http_status.HTTP_200_OK,
    summary="SHIP-API-003: Shipment tracking event timeline",
)
def get_shipment_tracking(
    shipment_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer fetches timeline of tracking events for their shipment."""
    try:
        s_uuid = uuid.UUID(shipment_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Shipment not found")

    shipment = (
        db.query(Shipment)
        .join(Order, Shipment.order_id == Order.id)
        .filter(Shipment.id == s_uuid, Order.user_id == current_user.id)
        .first()
    )
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found or unauthorized")

    return {
        "data": {
            "events": [
                {
                    "status": shipment.status or "created",
                    "description": f"Shipment status: {shipment.status or 'created'}",
                    "occurred_at": shipment.updated_at.isoformat() if shipment.updated_at else None,
                }
            ]
        },
        "request_id": str(uuid.uuid4()),
    }
