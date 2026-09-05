import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser
from app.services.manufacturing import ManufacturingService
from app.schemas.manufacturing import (
    ManufacturingRequestCreate,
    ManufacturingCancelRequest,
    ClarificationRespondRequest,
    ManufacturingRequestResponse,
    ManufacturingRequestListResponse,
    ClarificationListResponse,
    ClarificationSingleResponse,
    ManufacturingHistoryResponse,
)

router = APIRouter()


@router.post(
    "",
    response_model=ManufacturingRequestResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="MFG-API-001: Submit a new manufacturing request",
)
def create_manufacturing_request(
    body: ManufacturingRequestCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Submit a new manufacturing request. Requires email-verified customer (AUTH-001)."""
    mfg_req = ManufacturingService.create_request(
        db=db,
        user=current_user,
        data=body.model_dump(),
    )
    req_data, files, quote, clars, status_updates = ManufacturingService.get_request_detail(
        db=db,
        user=current_user,
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
            "internal_notes": None,  # Customer does not see internal notes
            "files": files,
            "current_quote": quote,
            "clarifications": clars,
            "status_updates": status_updates,
            "created_at": req_data.created_at.isoformat() if req_data.created_at else "",
            "updated_at": req_data.updated_at.isoformat() if req_data.updated_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "",
    response_model=ManufacturingRequestListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="MFG-API-002: List the customer's own manufacturing requests",
)
def list_manufacturing_requests(
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List customer's own requests with pagination and open clarification indicators."""
    items, pagination = ManufacturingService.list_requests(
        db=db,
        user=current_user,
        page=page,
        page_size=page_size,
    )
    return {
        "data": items,
        "pagination": pagination,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{request_id}",
    response_model=ManufacturingRequestResponse,
    status_code=http_status.HTTP_200_OK,
    summary="MFG-API-003: Customer request detail",
)
def get_manufacturing_request_detail(
    request_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Fetch request detail with IDOR protection (404 for non-owners)."""
    req_data, files, quote, clars, status_updates = ManufacturingService.get_request_detail(
        db=db,
        user=current_user,
        request_id=request_id,
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
            "internal_notes": None,
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
    "/{request_id}/cancel",
    response_model=ManufacturingRequestResponse,
    status_code=http_status.HTTP_200_OK,
    summary="MFG-API-004: Cancel manufacturing request",
)
def cancel_manufacturing_request(
    request_id: str,
    body: ManufacturingCancelRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer cancel request. Pre-payment cancels immediately; execution requires review."""
    mfg_req = ManufacturingService.cancel_request(
        db=db,
        user=current_user,
        request_id=request_id,
        reason=body.reason,
    )
    req_data, files, quote, clars, status_updates = ManufacturingService.get_request_detail(
        db=db,
        user=current_user,
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
            "internal_notes": None,
            "files": files,
            "current_quote": quote,
            "clarifications": clars,
            "status_updates": status_updates,
            "created_at": req_data.created_at.isoformat() if req_data.created_at else "",
            "updated_at": req_data.updated_at.isoformat() if req_data.updated_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{request_id}/clarifications",
    response_model=ClarificationListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="MFG-API-005: List clarification Q&A items",
)
def list_manufacturing_clarifications(
    request_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """List structured, asynchronous clarification items for this request."""
    items = ManufacturingService.list_clarifications(
        db=db,
        user=current_user,
        request_id=request_id,
    )
    return {
        "data": items,
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{request_id}/clarifications/{clarification_id}/respond",
    response_model=ClarificationSingleResponse,
    status_code=http_status.HTTP_200_OK,
    summary="MFG-API-006: Customer answers an open clarification question",
)
def respond_to_clarification(
    request_id: str,
    clarification_id: str,
    body: ClarificationRespondRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Submit answer to an open question. Resolves item and transitions request if all answered."""
    clar = ManufacturingService.respond_to_clarification(
        db=db,
        user=current_user,
        request_id=request_id,
        clarification_id=clarification_id,
        text=body.text,
        attached_file_ids=body.attached_file_ids,
    )
    resp_dict = {
        "text": clar.response_text,
        "responded_at": clar.responded_at.isoformat() if clar.responded_at else None,
        "attached_file_ids": body.attached_file_ids or [],
    }
    return {
        "data": {
            "id": str(clar.id),
            "question": clar.question,
            "raised_by": "admin",
            "raised_at": clar.raised_at.isoformat() if clar.raised_at else "",
            "status": clar.status,
            "response": resp_dict,
        },
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{request_id}/history",
    response_model=ManufacturingHistoryResponse,
    status_code=http_status.HTTP_200_OK,
    summary="MFG-API-007: Request status/timeline history",
)
def get_manufacturing_history(
    request_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Timeline history feeding customer and admin request views."""
    events = ManufacturingService.get_history(
        db=db,
        user=current_user,
        request_id=request_id,
    )
    return {
        "data": events,
        "request_id": str(uuid.uuid4()),
    }
