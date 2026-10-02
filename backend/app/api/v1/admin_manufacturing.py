import uuid
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentAdmin
from app.services.manufacturing import ManufacturingService
from app.schemas.manufacturing import (
    AdminConfirmRequirementsRequest,
    AdminRaiseClarificationRequest,
    AdminStatusUpdateRequest,
    AdminResolveCancellationRequest,
    ManufacturingRequestResponse,
    ManufacturingRequestListResponse,
    ClarificationSingleResponse,
    StatusUpdateItem,
)

router = APIRouter()


@router.get(
    "/requests",
    response_model=ManufacturingRequestListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-MFG-API-001: Manufacturing operational queue",
)
def admin_list_manufacturing_queue(
    admin: CurrentAdmin,
    status: Optional[str] = Query(None),
    prototype_type: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    order: str = Query("asc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Operational queue for manufacturing requests with age tracking and status filters."""
    items, pagination = ManufacturingService.admin_list_queue(
        db=db,
        admin_user=admin,
        status=status,
        prototype_type=prototype_type,
        sort_by=sort_by,
        order=order,
        page=page,
        page_size=page_size,
    )
    return {
        "data": items,
        "pagination": pagination,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/cancellation-review-queue",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-MFG-API-008: List requests in cancellation review queue",
)
def admin_list_cancellation_review_queue(
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """List manufacturing requests flagged with cancellation_requested == True."""
    items = ManufacturingService.admin_list_cancellation_queue(
        db=db,
        admin_user=admin,
    )
    return {
        "data": items,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/requests/{id}",
    response_model=ManufacturingRequestResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-MFG-API-002: Admin full request detail",
)
def admin_get_manufacturing_request(
    id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Full request detail for administrators, including internal notes."""
    req_data, files, quote, clars, status_updates = ManufacturingService.get_request_detail(
        db=db,
        user=admin,
        request_id=id,
    )
    return {
        "data": {
            "id": str(req_data.id),
            "user_id": str(req_data.user_id),
            "project_id": str(req_data.project_id) if req_data.project_id else None,
            "title": req_data.title,
            "project_overview": req_data.project_overview,
            "prototype_type": req_data.prototype_type,
            "quantity": req_data.quantity,
            "technical_requirements": req_data.technical_requirements,
            "dimensions": req_data.dimensions,
            "materials": req_data.materials,
            "pcb_hardware_details": req_data.pcb_hardware_details,
            "manufacturing_requirements": req_data.manufacturing_requirements,
            "delivery_requirements": req_data.delivery_requirements,
            "additional_notes": req_data.additional_notes,
            "status": req_data.status,
            "cancellation_requested": req_data.cancellation_requested,
            "cancellation_reason": req_data.cancellation_reason,
            "cancellation_decision": req_data.cancellation_decision,
            "cancellation_refund_paise": req_data.cancellation_refund_paise,
            "cancellation_refund_amount": None,
            "cancellation_notes": req_data.cancellation_notes,
            "internal_notes": req_data.internal_notes,
            "files": files,
            "current_quote": quote,
            "clarifications": clars,
            "status_updates": status_updates,
            "created_at": req_data.created_at.isoformat() if req_data.created_at else "",
            "updated_at": req_data.updated_at.isoformat() if req_data.updated_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/requests/{id}/confirm-requirements",
    response_model=ManufacturingRequestResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-MFG-API-003: Confirm requirements",
)
def admin_confirm_requirements(
    id: str,
    body: AdminConfirmRequirementsRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Guarded state transition: under_review -> requirements_confirmed."""
    mfg_req = ManufacturingService.admin_confirm_requirements(
        db=db,
        admin_user=admin,
        request_id=id,
        notes=body.notes,
    )
    req_data, files, quote, clars, status_updates = ManufacturingService.get_request_detail(
        db=db,
        user=admin,
        request_id=str(mfg_req.id),
    )
    return {
        "data": {
            "id": str(req_data.id),
            "user_id": str(req_data.user_id),
            "project_id": str(req_data.project_id) if req_data.project_id else None,
            "title": req_data.title,
            "project_overview": req_data.project_overview,
            "prototype_type": req_data.prototype_type,
            "quantity": req_data.quantity,
            "technical_requirements": req_data.technical_requirements,
            "dimensions": req_data.dimensions,
            "materials": req_data.materials,
            "pcb_hardware_details": req_data.pcb_hardware_details,
            "manufacturing_requirements": req_data.manufacturing_requirements,
            "delivery_requirements": req_data.delivery_requirements,
            "additional_notes": req_data.additional_notes,
            "status": req_data.status,
            "cancellation_requested": req_data.cancellation_requested,
            "cancellation_reason": req_data.cancellation_reason,
            "cancellation_decision": req_data.cancellation_decision,
            "cancellation_refund_paise": req_data.cancellation_refund_paise,
            "cancellation_refund_amount": None,
            "cancellation_notes": req_data.cancellation_notes,
            "internal_notes": req_data.internal_notes,
            "files": files,
            "current_quote": quote,
            "clarifications": clars,
            "status_updates": status_updates,
            "created_at": req_data.created_at.isoformat() if req_data.created_at else "",
            "updated_at": req_data.updated_at.isoformat() if req_data.updated_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/requests/{id}/clarifications",
    response_model=ClarificationSingleResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="ADMIN-MFG-API-004: Raise a new clarification question",
)
def admin_raise_clarification(
    id: str,
    body: AdminRaiseClarificationRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Raise a structured clarification question; transitions request to clarification_needed."""
    clar = ManufacturingService.admin_raise_clarification(
        db=db,
        admin_user=admin,
        request_id=id,
        question=body.question,
    )
    return {
        "data": {
            "id": str(clar.id),
            "question": clar.question,
            "raised_by": "admin",
            "raised_at": clar.raised_at.isoformat() if clar.raised_at else "",
            "status": clar.status,
            "response": None,
        },
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/requests/{id}/status-update",
    status_code=http_status.HTTP_201_CREATED,
    summary="ADMIN-MFG-API-005: Post an execution status note",
)
def admin_post_status_update(
    id: str,
    body: AdminStatusUpdateRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Post customer-visible plain-language progress update."""
    su = ManufacturingService.admin_post_status_update(
        db=db,
        admin_user=admin,
        request_id=id,
        note=body.note,
    )
    return {
        "data": {
            "id": str(su.id),
            "note": su.note,
            "author": admin.full_name or "Engineer",
            "created_at": su.created_at.isoformat() if su.created_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/requests/{id}/complete-execution",
    response_model=ManufacturingRequestResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-MFG-API-006: Complete execution",
)
def admin_complete_execution(
    id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Guarded state transition: in_progress -> completed_execution."""
    mfg_req = ManufacturingService.admin_complete_execution(
        db=db,
        admin_user=admin,
        request_id=id,
    )
    req_data, files, quote, clars, status_updates = ManufacturingService.get_request_detail(
        db=db,
        user=admin,
        request_id=str(mfg_req.id),
    )
    return {
        "data": {
            "id": str(req_data.id),
            "user_id": str(req_data.user_id),
            "project_id": str(req_data.project_id) if req_data.project_id else None,
            "title": req_data.title,
            "project_overview": req_data.project_overview,
            "prototype_type": req_data.prototype_type,
            "quantity": req_data.quantity,
            "technical_requirements": req_data.technical_requirements,
            "dimensions": req_data.dimensions,
            "materials": req_data.materials,
            "pcb_hardware_details": req_data.pcb_hardware_details,
            "manufacturing_requirements": req_data.manufacturing_requirements,
            "delivery_requirements": req_data.delivery_requirements,
            "additional_notes": req_data.additional_notes,
            "status": req_data.status,
            "cancellation_requested": req_data.cancellation_requested,
            "cancellation_reason": req_data.cancellation_reason,
            "cancellation_decision": req_data.cancellation_decision,
            "cancellation_refund_paise": req_data.cancellation_refund_paise,
            "cancellation_refund_amount": None,
            "cancellation_notes": req_data.cancellation_notes,
            "internal_notes": req_data.internal_notes,
            "files": files,
            "current_quote": quote,
            "clarifications": clars,
            "status_updates": status_updates,
            "created_at": req_data.created_at.isoformat() if req_data.created_at else "",
            "updated_at": req_data.updated_at.isoformat() if req_data.updated_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/requests/{id}/complete",
    response_model=ManufacturingRequestResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-MFG-API-007: Complete request",
)
def admin_complete_request(
    id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Guarded state transition: delivered -> completed."""
    mfg_req = ManufacturingService.admin_complete_request(
        db=db,
        admin_user=admin,
        request_id=id,
    )
    req_data, files, quote, clars, status_updates = ManufacturingService.get_request_detail(
        db=db,
        user=admin,
        request_id=str(mfg_req.id),
    )
    return {
        "data": {
            "id": str(req_data.id),
            "user_id": str(req_data.user_id),
            "project_id": str(req_data.project_id) if req_data.project_id else None,
            "title": req_data.title,
            "project_overview": req_data.project_overview,
            "prototype_type": req_data.prototype_type,
            "quantity": req_data.quantity,
            "technical_requirements": req_data.technical_requirements,
            "dimensions": req_data.dimensions,
            "materials": req_data.materials,
            "pcb_hardware_details": req_data.pcb_hardware_details,
            "manufacturing_requirements": req_data.manufacturing_requirements,
            "delivery_requirements": req_data.delivery_requirements,
            "additional_notes": req_data.additional_notes,
            "status": req_data.status,
            "cancellation_requested": req_data.cancellation_requested,
            "cancellation_reason": req_data.cancellation_reason,
            "cancellation_decision": req_data.cancellation_decision,
            "cancellation_refund_paise": req_data.cancellation_refund_paise,
            "cancellation_refund_amount": None,
            "cancellation_notes": req_data.cancellation_notes,
            "internal_notes": req_data.internal_notes,
            "files": files,
            "current_quote": quote,
            "clarifications": clars,
            "status_updates": status_updates,
            "created_at": req_data.created_at.isoformat() if req_data.created_at else "",
            "updated_at": req_data.updated_at.isoformat() if req_data.updated_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/requests/{id}/resolve-cancellation",
    response_model=ManufacturingRequestResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-MFG-API-009: Resolve post-execution cancellation request",
)
def admin_resolve_cancellation(
    id: str,
    body: AdminResolveCancellationRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Approve (with refund terms) or decline a post-execution cancellation."""
    mfg_req = ManufacturingService.admin_resolve_cancellation(
        db=db,
        admin_user=admin,
        request_id=id,
        decision=body.decision,
        refund_amount=body.refund_amount,
        notes=body.notes,
    )
    req_data, files, quote, clars, status_updates = ManufacturingService.get_request_detail(
        db=db,
        user=admin,
        request_id=str(mfg_req.id),
    )
    return {
        "data": {
            "id": str(req_data.id),
            "user_id": str(req_data.user_id),
            "project_id": str(req_data.project_id) if req_data.project_id else None,
            "title": req_data.title,
            "project_overview": req_data.project_overview,
            "prototype_type": req_data.prototype_type,
            "quantity": req_data.quantity,
            "technical_requirements": req_data.technical_requirements,
            "dimensions": req_data.dimensions,
            "materials": req_data.materials,
            "pcb_hardware_details": req_data.pcb_hardware_details,
            "manufacturing_requirements": req_data.manufacturing_requirements,
            "delivery_requirements": req_data.delivery_requirements,
            "additional_notes": req_data.additional_notes,
            "status": req_data.status,
            "cancellation_requested": req_data.cancellation_requested,
            "cancellation_reason": req_data.cancellation_reason,
            "cancellation_decision": req_data.cancellation_decision,
            "cancellation_refund_paise": req_data.cancellation_refund_paise,
            "cancellation_refund_amount": None,
            "cancellation_notes": req_data.cancellation_notes,
            "internal_notes": req_data.internal_notes,
            "files": files,
            "current_quote": quote,
            "clarifications": clars,
            "status_updates": status_updates,
            "created_at": req_data.created_at.isoformat() if req_data.created_at else "",
            "updated_at": req_data.updated_at.isoformat() if req_data.updated_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


class CreateManufacturingShipmentRequest(BaseModel):
    carrier: Optional[str] = "Delhivery"
    tracking_number: Optional[str] = None
    weight_grams: Optional[int] = 500


@router.post(
    "/{id}/shipment",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SHIP-API-002: Create shipment for manufacturing deliverable",
)
def admin_create_manufacturing_shipment(
    id: str,
    body: CreateManufacturingShipmentRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    from app.models.project import ManufacturingRequest
    from app.models.order import Shipment
    from app.integrations.shiprocket.client import shiprocket_provider
    from app.services.notification import NotificationService
    from datetime import datetime, timezone

    try:
        m_uuid = uuid.UUID(id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Manufacturing request not found")

    mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == m_uuid).first()
    if not mfg:
        raise HTTPException(status_code=404, detail="Manufacturing request not found")

    shipment = db.query(Shipment).filter(Shipment.manufacturing_request_id == mfg.id).first()
    if not shipment:
        carrier = body.carrier or "Delhivery"
        tracking = body.tracking_number
        sr_order_id = None
        if not tracking:
            ship_res = shiprocket_provider.create_shipment(
                reference_id=str(mfg.id),
                pickup_pincode="500001",
                delivery_pincode="500001",
                weight_grams=body.weight_grams or 500,
            )
            tracking = ship_res.get("tracking_number")
            sr_order_id = ship_res.get("shiprocket_order_id")
            carrier = ship_res.get("carrier") or carrier

        shipment = Shipment(
            manufacturing_request_id=mfg.id,
            shiprocket_order_id=sr_order_id,
            tracking_number=tracking,
            carrier=carrier,
            status="created",
            created_at=datetime.now(timezone.utc),
        )
        db.add(shipment)

    mfg.status = "delivered"
    mfg.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(shipment)

    NotificationService.notify_shipment_update(db, mfg.user_id, f"{shipment.tracking_number} (delivered)")

    return {
        "data": {
            "id": str(shipment.id),
            "manufacturing_request_id": str(shipment.manufacturing_request_id),
            "carrier": shipment.carrier,
            "tracking_number": shipment.tracking_number,
            "status": shipment.status,
            "created_at": shipment.created_at.isoformat() if shipment.created_at else None,
        },
        "request_id": str(uuid.uuid4()),
    }

