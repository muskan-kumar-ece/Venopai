import uuid
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, Query, HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser, CurrentAdmin
from app.core.config import settings
from app.integrations.shiprocket import shiprocket_provider
from app.integrations.shiprocket.exceptions import ShiprocketError
from app.core.exceptions import APIException
from app.models.order import Shipment, Order
from app.core.cache import cache_get, cache_set
import logging

logger = logging.getLogger("venopai.api.shipping")

router = APIRouter()
admin_router = APIRouter()


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

    is_serviceable = False
    try:
        is_serviceable = shiprocket_provider.check_serviceability(clean)
    except ShiprocketError as se:
        logger.error(f"Carrier serviceability check failed for PIN {clean}: {se}")
        raise APIException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            code="SHIPPING_SERVICE_UNAVAILABLE",
            message="Shipping carrier service is temporarily unreachable. Please retry shortly.",
        )

    data = {
        "pincode": clean,
        "serviceable": is_serviceable,
        "estimated_days_min": 3 if is_serviceable else 0,
        "estimated_days_max": 5 if is_serviceable else 0,
    }
    cache_set(cache_key, data, ttl_seconds=settings.SHIPROCKET_SERVICEABILITY_CACHE_TTL_SECONDS)
    return {
        "data": data,
        "request_id": str(uuid.uuid4()),
    }



from pydantic import BaseModel
from app.services.catalog import _rupees

class ShippingRatesRequest(BaseModel):
    origin_pincode: Optional[str] = None
    destination_pincode: str
    weight_grams: int = 500
    length_cm: Optional[float] = None
    breadth_cm: Optional[float] = None
    height_cm: Optional[float] = None


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
    origin = body.origin_pincode or settings.SHIPROCKET_ORIGIN_PINCODE
    try:
        res = shiprocket_provider.calculate_rate_and_eta(
            origin_pincode=origin,
            destination_pincode=body.destination_pincode,
            weight_grams=body.weight_grams,
            length_cm=body.length_cm,
            breadth_cm=body.breadth_cm,
            height_cm=body.height_cm,
        )
    except ShiprocketError as se:
        logger.error(f"Carrier shipping rates query failed: {se}")
        raise APIException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            code="SHIPPING_SERVICE_UNAVAILABLE",
            message="Shipping carrier rate service is temporarily unreachable. Please retry shortly.",
        )

    available_couriers = res.get("available_couriers") or []
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
            "rates": available_couriers if available_couriers else [courier_item],
            "available_couriers": available_couriers if available_couriers else [courier_item],
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
    """Customer fetches chronological timeline of tracking events for their shipment with strict ownership checks."""
    try:
        s_uuid = uuid.UUID(shipment_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Shipment not found")

    from app.models.project import ManufacturingRequest
    from app.models.order import ShipmentTrackingEvent

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

    # Load persisted scan events from database
    event_rows = db.query(ShipmentTrackingEvent).filter(
        ShipmentTrackingEvent.shipment_id == shipment.id
    ).order_by(ShipmentTrackingEvent.occurred_at.asc(), ShipmentTrackingEvent.created_at.asc()).all()

    events = []
    for e in event_rows:
        events.append({
            "status": e.status,
            "activity": e.activity or f"Status: {e.status}",
            "location": e.location,
            "carrier": e.carrier or shipment.carrier,
            "occurred_at": e.occurred_at.isoformat() if e.occurred_at else e.created_at.isoformat(),
        })

    # If no scan events persisted yet, provide initial baseline status event
    if not events:
        is_awaiting = shipment.status in ("pending", "created", "ready_to_ship")
        desc = "Shipment created, awaiting courier pickup and first physical scan" if is_awaiting else f"Shipment status: {shipment.status or 'created'}"
        events = [
            {
                "status": shipment.status or "created",
                "activity": desc,
                "location": None,
                "carrier": shipment.carrier or "Delhivery",
                "occurred_at": shipment.updated_at.isoformat() if shipment.updated_at else (shipment.created_at.isoformat() if shipment.created_at else None),
            }
        ]

    return {
        "data": {
            "shipment_id": str(shipment.id),
            "tracking_number": shipment.tracking_number,
            "carrier": shipment.carrier or "Delhivery",
            "status": shipment.status,
            "estimated_delivery": shipment.estimated_delivery.isoformat() if shipment.estimated_delivery else None,
            "is_awaiting_scan": shipment.status in ("pending", "created", "ready_to_ship") and len(event_rows) == 0,
            "last_tracking_synced_at": shipment.last_tracking_synced_at.isoformat() if shipment.last_tracking_synced_at else None,
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
            "shiprocket_order_id": s.shiprocket_order_id,
            "shiprocket_shipment_id": s.shiprocket_shipment_id,
            "booking_status": s.booking_status,
            "status": s.status,
            "label_url": s.label_url,
            "label_status": s.label_status,
            "pickup_token_number": s.pickup_token_number,
            "pickup_status": s.pickup_status,
            "manifest_url": s.manifest_url,
            "manifest_status": s.manifest_status,
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


class AssignAwbRequest(BaseModel):
    courier_id: Optional[int] = None


@admin_router.post(
    "/{shipment_id}/reconcile",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-003: Reconcile uncertain shipment booking",
)
@router.post(
    "/admin/{shipment_id}/reconcile",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-003: Reconcile uncertain shipment booking",
)
def admin_reconcile_shipment(
    shipment_id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    from app.services.shipping import ShippingService

    shipment = ShippingService.reconcile_shipment(
        db=db,
        shipment_id=shipment_id,
        admin_user=admin,
    )
    return {
        "data": {
            "id": str(shipment.id),
            "order_id": str(shipment.order_id) if shipment.order_id else None,
            "manufacturing_request_id": str(shipment.manufacturing_request_id) if shipment.manufacturing_request_id else None,
            "carrier": shipment.carrier,
            "tracking_number": shipment.tracking_number,
            "shiprocket_order_id": shipment.shiprocket_order_id,
            "shiprocket_shipment_id": shipment.shiprocket_shipment_id,
            "booking_status": shipment.booking_status,
            "status": shipment.status,
            "reconciliation_notes": shipment.reconciliation_notes,
            "updated_at": shipment.updated_at.isoformat() if shipment.updated_at else None,
        },
        "request_id": str(uuid.uuid4()),
    }


@admin_router.post(
    "/{shipment_id}/assign-awb",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-004: Explicitly assign courier and generate AWB",
)
@router.post(
    "/admin/{shipment_id}/assign-awb",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-004: Explicitly assign courier and generate AWB",
)
def admin_assign_awb(
    shipment_id: str,
    body: AssignAwbRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    from app.services.shipping import ShippingService

    shipment = ShippingService.assign_shipment_awb(
        db=db,
        shipment_id=shipment_id,
        courier_id=body.courier_id,
        admin_user=admin,
    )
    return {
        "data": {
            "id": str(shipment.id),
            "order_id": str(shipment.order_id) if shipment.order_id else None,
            "manufacturing_request_id": str(shipment.manufacturing_request_id) if shipment.manufacturing_request_id else None,
            "carrier": shipment.carrier,
            "tracking_number": shipment.tracking_number,
            "shiprocket_order_id": shipment.shiprocket_order_id,
            "shiprocket_shipment_id": shipment.shiprocket_shipment_id,
            "courier_company_id": shipment.courier_company_id,
            "booking_status": shipment.booking_status,
            "status": shipment.status,
            "updated_at": shipment.updated_at.isoformat() if shipment.updated_at else None,
        },
        "request_id": str(uuid.uuid4()),
    }


class SchedulePickupRequest(BaseModel):
    pickup_date: Optional[str] = None


class GenerateLabelRequest(BaseModel):
    force_regenerate: bool = False


class BatchManifestRequest(BaseModel):
    shipment_ids: List[str]


@admin_router.post(
    "/{shipment_id}/label",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-005: Generate or retrieve shipping label",
)
@router.post(
    "/admin/{shipment_id}/label",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-005: Generate or retrieve shipping label",
)
def admin_generate_label(
    shipment_id: str,
    admin: CurrentAdmin,
    body: Optional[GenerateLabelRequest] = None,
    db: Session = Depends(get_db),
):
    from app.services.shipping import ShippingService

    force = body.force_regenerate if body else False
    result = ShippingService.get_or_generate_label(
        db=db,
        shipment_id=shipment_id,
        admin_user=admin,
        force_regenerate=force,
    )
    return {
        "data": result,
        "request_id": str(uuid.uuid4()),
    }


@admin_router.get(
    "/{shipment_id}/label",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-005G: Retrieve existing or generate shipping label",
)
@router.get(
    "/admin/{shipment_id}/label",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-005G: Retrieve existing or generate shipping label",
)
def admin_get_label(
    shipment_id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    from app.services.shipping import ShippingService

    result = ShippingService.get_or_generate_label(
        db=db,
        shipment_id=shipment_id,
        admin_user=admin,
        force_regenerate=False,
    )
    return {
        "data": result,
        "request_id": str(uuid.uuid4()),
    }


@admin_router.post(
    "/{shipment_id}/pickup",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-006: Schedule courier pickup",
)
@router.post(
    "/admin/{shipment_id}/pickup",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-006: Schedule courier pickup",
)
def admin_schedule_pickup(
    shipment_id: str,
    admin: CurrentAdmin,
    body: Optional[SchedulePickupRequest] = None,
    db: Session = Depends(get_db),
):
    from app.services.shipping import ShippingService

    pickup_date = body.pickup_date if body else None
    result = ShippingService.schedule_shipment_pickup(
        db=db,
        shipment_id=shipment_id,
        pickup_date=pickup_date,
        admin_user=admin,
    )
    return {
        "data": result,
        "request_id": str(uuid.uuid4()),
    }


@admin_router.post(
    "/{shipment_id}/manifest",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-007: Generate shipping manifest for shipment",
)
@router.post(
    "/admin/{shipment_id}/manifest",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-007: Generate shipping manifest for shipment",
)
def admin_generate_single_manifest(
    shipment_id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    from app.services.shipping import ShippingService

    result = ShippingService.generate_manifest(
        db=db,
        shipment_ids=[shipment_id],
        admin_user=admin,
    )
    return {
        "data": result,
        "request_id": str(uuid.uuid4()),
    }


@admin_router.get(
    "/{shipment_id}/manifest",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-008: Retrieve shipping manifest for shipment",
)
@router.get(
    "/admin/{shipment_id}/manifest",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-008: Retrieve shipping manifest for shipment",
)
def admin_get_manifest(
    shipment_id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    from app.services.shipping import ShippingService

    result = ShippingService.get_manifest(
        db=db,
        shipment_id=shipment_id,
        admin_user=admin,
    )
    return {
        "data": result,
        "request_id": str(uuid.uuid4()),
    }


@admin_router.post(
    "/manifests/generate",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-009: Batch generate shipping manifest across shipments",
)
@router.post(
    "/admin/manifests/generate",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-009: Batch generate shipping manifest across shipments",
)
def admin_batch_generate_manifest(
    body: BatchManifestRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    from app.services.shipping import ShippingService

    result = ShippingService.generate_manifest(
        db=db,
        shipment_ids=body.shipment_ids,
        admin_user=admin,
    )
    return {
        "data": result,
        "request_id": str(uuid.uuid4()),
    }


# -------------------------------------------------------------------------
# Phase 5: Admin Operational Exceptions & Tracking Synchronization
# -------------------------------------------------------------------------

@admin_router.get(
    "/exceptions",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-010: List shipping operational exceptions and delays",
)
@router.get(
    "/admin/exceptions",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-010: List shipping operational exceptions and delays",
)
def admin_list_exceptions(
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Admin dashboard: List shipments with operational exceptions, delays, RTO, or conflicts."""
    from app.services.shipping import ShippingService

    result = ShippingService.list_shipping_exceptions(
        db=db,
        page=page,
        page_size=page_size,
    )
    return {
        "data": result,
        "request_id": str(uuid.uuid4()),
    }


@admin_router.get(
    "/webhooks/inbox",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-011: Inspect durable shipping webhook inbox events",
)
@router.get(
    "/admin/webhooks/inbox",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-011: Inspect durable shipping webhook inbox events",
)
def admin_list_webhook_inbox(
    admin: CurrentAdmin,
    status: Optional[str] = Query(None, description="Filter by event processing status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Admin dashboard: List durable webhook inbox events for audit and diagnostic inspection."""
    from app.services.shipping import ShippingService

    result = ShippingService.list_webhook_inbox(
        db=db,
        status=status,
        page=page,
        page_size=page_size,
    )
    return {
        "data": result,
        "request_id": str(uuid.uuid4()),
    }


@admin_router.post(
    "/webhooks/inbox/{inbox_id}/retry",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-012: Retry failed shipping webhook inbox event",
)
@router.post(
    "/admin/webhooks/inbox/{inbox_id}/retry",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-012: Retry failed shipping webhook inbox event",
)
def admin_retry_webhook_inbox(
    inbox_id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin operation: Manually re-trigger processing of a failed or pending webhook event."""
    from app.services.shipping import ShippingService

    result = ShippingService.retry_webhook_inbox_event(
        db=db,
        inbox_id=inbox_id,
        admin_user=admin,
    )
    return {
        "data": result,
        "request_id": str(uuid.uuid4()),
    }


@admin_router.post(
    "/{shipment_id}/sync-tracking",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-013: Manually sync live tracking from carrier",
)
@router.post(
    "/admin/{shipment_id}/sync-tracking",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-013: Manually sync live tracking from carrier",
)
def admin_sync_shipment_tracking(
    shipment_id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin operation: Manually query carrier tracking and synchronize state machine."""
    from app.services.shipping import ShippingService

    result = ShippingService.sync_shipment_tracking(
        db=db,
        shipment_id=shipment_id,
        admin_user=admin,
    )
    return {
        "data": result,
        "request_id": str(uuid.uuid4()),
    }




