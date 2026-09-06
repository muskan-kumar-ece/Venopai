import uuid
import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser
from app.services.software import SoftwareService
from app.models.project import ProjectFile
from app.schemas.service_requests import (
    SoftwareRequestCreate,
    SoftwareRequestResponse,
    SoftwareRequestListResponse,
)
from app.schemas.manufacturing import (
    ManufacturingCancelRequest,
    ClarificationRespondRequest,
    ClarificationListResponse,
)

router = APIRouter()


def _serialize_software(req, db: Session) -> Dict[str, Any]:
    files = db.query(ProjectFile).filter(
        ProjectFile.association_type == "software",
        ProjectFile.association_id == req.id,
    ).all()
    file_list = [
        {
            "id": str(f.id),
            "filename": f.filename,
            "content_type": f.content_type,
            "size_bytes": f.size_bytes,
            "scan_status": f.scan_status,
            "source": f.source,
            "created_at": f.created_at.isoformat() if f.created_at else "",
        }
        for f in files
    ]
    return {
        "id": str(req.id),
        "user_id": str(req.user_id),
        "project_id": str(req.project_id) if req.project_id else None,
        "title": req.title,
        "project_description": req.project_description,
        "requirements": req.requirements,
        "platform_technology": req.platform_technology,
        "additional_notes": req.additional_notes,
        "status": req.status,
        "cancellation_requested": req.cancellation_requested,
        "cancellation_decision": req.cancellation_decision,
        "cancellation_refund_paise": req.cancellation_refund_paise,
        "cancellation_notes": req.cancellation_notes,
        "files": file_list,
        "created_at": req.created_at.isoformat() if req.created_at else "",
        "updated_at": req.updated_at.isoformat() if req.updated_at else "",
    }


@router.post(
    "",
    response_model=SoftwareRequestResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="SW-API-001: Submit software/firmware request",
)
def create_software_request(
    body: SoftwareRequestCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Submit a software/firmware service request."""
    req = SoftwareService.submit_request(
        db=db,
        user=current_user,
        title=body.title,
        project_description=body.project_description,
        requirements=body.requirements,
        platform_technology=body.platform_technology,
        reference_file_ids=body.reference_file_ids,
        additional_notes=body.additional_notes,
    )
    return {
        "data": _serialize_software(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "",
    response_model=SoftwareRequestListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="SW-API-002: List own software requests",
)
def list_software_requests(
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List customer's own software requests."""
    requests, total = SoftwareService.list_requests(
        db=db,
        user=current_user,
        page=page,
        page_size=page_size,
    )
    return {
        "data": [_serialize_software(r, db) for r in requests],
        "total": total,
        "page": page,
        "page_size": page_size,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{id}",
    response_model=SoftwareRequestResponse,
    status_code=http_status.HTTP_200_OK,
    summary="SW-API-003: Software request detail",
)
def get_software_request(
    id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer software request detail with strict 404 IDOR protection."""
    req = SoftwareService.get_request(
        db=db,
        user=current_user,
        request_id=id,
    )
    return {
        "data": _serialize_software(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/cancel",
    response_model=SoftwareRequestResponse,
    status_code=http_status.HTTP_200_OK,
    summary="SW-API-004: Cancel software request",
)
def cancel_software_request(
    id: str,
    body: ManufacturingCancelRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Cancel software request (mirrors MFG cancellation rules)."""
    req = SoftwareService.cancel_request(
        db=db,
        user=current_user,
        request_id=id,
        reason=body.reason,
    )
    return {
        "data": _serialize_software(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/complete",
    response_model=SoftwareRequestResponse,
    status_code=http_status.HTTP_200_OK,
    summary="Customer marks software request completed",
)
def complete_software_request(
    id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer completes software request."""
    req = SoftwareService.customer_complete_request(
        db=db,
        user=current_user,
        request_id=id,
    )
    return {
        "data": _serialize_software(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{id}/clarifications",
    response_model=ClarificationListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="SW-API-005: List software clarifications",
)
def list_software_clarifications(
    id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """List clarifications for a software request."""
    clarifications = SoftwareService.list_clarifications(
        db=db,
        user=current_user,
        request_id=id,
    )
    result = []
    for c in clarifications:
        att_files = []
        if c.attached_file_ids:
            try:
                att_files = json.loads(c.attached_file_ids)
            except Exception:
                pass
        result.append({
            "id": str(c.id),
            "request_id": str(c.request_id),
            "question": c.question,
            "raised_by_id": str(c.raised_by_id),
            "raised_at": c.raised_at.isoformat() if c.raised_at else "",
            "status": c.status,
            "response_text": c.response_text,
            "responded_at": c.responded_at.isoformat() if c.responded_at else None,
            "attached_file_ids": att_files,
        })
    return {
        "data": result,
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/clarifications/{clarification_id}/respond",
    status_code=http_status.HTTP_200_OK,
    summary="SW-API-005: Respond to software clarification",
)
def respond_software_clarification(
    id: str,
    clarification_id: str,
    body: ClarificationRespondRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer responds to a software clarification item."""
    clarification = SoftwareService.respond_clarification(
        db=db,
        user=current_user,
        request_id=id,
        clarification_id=clarification_id,
        text=body.text,
        attached_file_ids=body.attached_file_ids,
    )
    att_files = []
    if clarification.attached_file_ids:
        try:
            att_files = json.loads(clarification.attached_file_ids)
        except Exception:
            pass
    return {
        "data": {
            "id": str(clarification.id),
            "request_id": str(clarification.request_id),
            "question": clarification.question,
            "raised_by_id": str(clarification.raised_by_id),
            "raised_at": clarification.raised_at.isoformat() if clarification.raised_at else "",
            "status": clarification.status,
            "response_text": clarification.response_text,
            "responded_at": clarification.responded_at.isoformat() if clarification.responded_at else None,
            "attached_file_ids": att_files,
        },
        "request_id": str(uuid.uuid4()),
    }
