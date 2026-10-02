import uuid
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser, CurrentAdmin
from app.integrations.shiprocket.client import ShiprocketProvider
from app.models.order import Shipment, Order
from app.core.cache import cache_get, cache_set

router = APIRouter()
admin_router = APIRouter()
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
    cache_key = f"cache:ship:pincode:{clean}"
    cached_res = cache_get(cache_key)
    if cached_res is not None:
        return {
            "data": cached_res,
            "request_id": str(uuid.uuid4()),
        }

    is_serviceable = shiprocket_provider.check_serviceability(clean)
    data = {
        "pincode": clean,
        "serviceable": is_serviceable,
        "estimated_days_min": 3 if is_serviceable else 0,
        "estimated_days_max": 5 if is_serviceable else 0,
    }
    cache_set(cache_key, data, ttl_seconds=86400)
    return {
        "data": data,
        "request_id": str(uuid.uuid4()),
    }



from pydantic import BaseModel
from app.services.catalog import _rupees

class ShippingRatesRequest(BaseModel):
    origin_pincode: Optional[str] = "560001"
    destination_pincode: str
    weight_grams: int = 500


@router.post(
    "/rates",
    status_code=http_status.HTTP_200_OK,
    summary="SHIP-API-005: Calculate shipping rates and available couriers",
)
@admin_router.post(
    "/rates",
    status_code=http_status.HTTP_200_OK,
    summary="SHIP-API-005: Calculate shipping rates and available couriers (Admin)",
)
def calculate_shipping_rates(body: ShippingRatesRequest):
    origin = body.origin_pincode or "560001"
    res = shiprocket_provider.calculate_rate_and_eta(
        origin_pincode=origin,
        destination_pincode=body.destination_pincode,
        weight_grams=body.weight_grams,
    )
    rate_val = float(_rupees(res["rate_paise"])) if res["serviceable"] else 0.0
    courier_item = {
        "courier_name": res["courier_name"],
        "rate": rate_val,
        "rate_paise": res["rate_paise"],
        "estimated_days": res["eta_days_max"],
        "eta_days_min": res["eta_days_min"],
        "eta_days_max": res["eta_days_max"],
        "serviceable": res["serviceable"],
    }
    return {
        "data": {
            "origin_pincode": origin,
            "destination_pincode": body.destination_pincode,
            "weight_grams": body.weight_grams,
            "rates": [courier_item],
            "available_couriers": [courier_item],
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

    from app.models.project import ManufacturingRequest

    shipment = db.query(Shipment).filter(Shipment.id == s_uuid).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    # Verify authorization
    has_access = False
    if shipment.order_id:
        order = db.query(Order).filter(Order.id == shipment.order_id, Order.user_id == current_user.id).first()
        if order:
            has_access = True
    elif shipment.manufacturing_request_id:
        mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == shipment.manufacturing_request_id, ManufacturingRequest.user_id == current_user.id).first()
        if mfg:
            has_access = True

    if not has_access and not getattr(current_user, "is_superuser", False) and getattr(current_user, "role", "") != "SUPER_ADMIN":
        raise HTTPException(status_code=404, detail="Shipment not found or unauthorized")

    return {
        "data": {
            "id": str(shipment.id),
            "order_id": str(shipment.order_id) if shipment.order_id else None,
            "manufacturing_request_id": str(shipment.manufacturing_request_id) if shipment.manufacturing_request_id else None,
            "carrier": shipment.carrier or "Delhivery",
            "tracking_number": shipment.tracking_number,
            "status": shipment.status,
            "estimated_delivery": shipment.estimated_delivery.isoformat() if shipment.estimated_delivery else None,
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

    from app.models.project import ManufacturingRequest

    shipment = db.query(Shipment).filter(Shipment.id == s_uuid).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    has_access = False
    if shipment.order_id:
        order = db.query(Order).filter(Order.id == shipment.order_id, Order.user_id == current_user.id).first()
        if order:
            has_access = True
    elif shipment.manufacturing_request_id:
        mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == shipment.manufacturing_request_id, ManufacturingRequest.user_id == current_user.id).first()
        if mfg:
            has_access = True

    if not has_access and not getattr(current_user, "is_superuser", False) and getattr(current_user, "role", "") != "SUPER_ADMIN":
        raise HTTPException(status_code=404, detail="Shipment not found or unauthorized")

    events = []
    if shipment.tracking_number:
        try:
            status_data = shiprocket_provider.get_tracking_status(shipment.tracking_number)
            events = status_data.get("events") or []
        except Exception:
            pass

    if not events:
        events = [
            {
                "status": shipment.status or "created",
                "description": f"Shipment status: {shipment.status or 'created'}",
                "occurred_at": shipment.updated_at.isoformat() if shipment.updated_at else None,
            }
        ]

    return {
        "data": {
            "tracking_number": shipment.tracking_number,
            "carrier": shipment.carrier or "Delhivery",
            "status": shipment.status,
            "events": events,
        },
        "request_id": str(uuid.uuid4()),
    }


@admin_router.get(
    "",
    status_code=http_status.HTTP_200_OK,
    summary="SHIP-API-004: Admin list all shipments",
)
@router.get(
    "/admin/all",
    status_code=http_status.HTTP_200_OK,
    summary="SHIP-API-004: Admin list all shipments",
)
def admin_list_shipments(
    admin: CurrentAdmin,
    status: Optional[str] = Query(None),
    carrier: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Admin list shipments across orders and manufacturing requests."""
    query = db.query(Shipment).outerjoin(Order, Shipment.order_id == Order.id)
    if status:
        query = query.filter(Shipment.status == status.lower())
    if carrier:
        query = query.filter(Shipment.carrier.ilike(f"%{carrier.strip()}%"))
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (Shipment.tracking_number.ilike(s)) |
            (Shipment.shiprocket_order_id.ilike(s)) |
            (Order.order_number.ilike(s))
        )
        
    total = query.count()
    shipments = (
        query.order_by(Shipment.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    
    data = []
    for s in shipments:
        data.append({
            "id": str(s.id),
            "order_id": str(s.order_id) if s.order_id else None,
            "order_number": s.order.order_number if s.order else None,
            "manufacturing_request_id": str(s.manufacturing_request_id) if s.manufacturing_request_id else None,
            "carrier": s.carrier or "Delhivery",
            "tracking_number": s.tracking_number,
            "status": s.status,
            "estimated_delivery": s.estimated_delivery.isoformat() if s.estimated_delivery else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        })
        
    return {
        "data": data,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if total > 0 else 1,
        },
        "request_id": str(uuid.uuid4()),
    }

