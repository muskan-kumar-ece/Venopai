import uuid
import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser
from app.services.design import DesignService
from app.models.project import ProjectFile
from app.schemas.service_requests import (
    DesignRequestCreate,
    DesignRequestResponse,
    DesignRequestListResponse,
    StartManufacturingDraftResponse,
)
from app.schemas.manufacturing import (
    ManufacturingCancelRequest,
    ClarificationRespondRequest,
    ClarificationListResponse,
)

router = APIRouter()


def _serialize_design(req, db: Session) -> Dict[str, Any]:
    files = db.query(ProjectFile).filter(
        ProjectFile.association_type == "design",
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
        "project_overview": req.project_overview,
        "design_scope": req.design_scope,
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
    response_model=DesignRequestResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="DESIGN-API-001: Submit PCB/Electronics design request",
)
def create_design_request(
    body: DesignRequestCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Submit a new design request."""
    req = DesignService.submit_request(
        db=db,
        user=current_user,
        title=body.title,
        project_overview=body.project_overview,
        design_scope=body.design_scope,
        reference_file_ids=body.reference_file_ids,
        additional_notes=body.additional_notes,
    )
    return {
        "data": _serialize_design(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "",
    response_model=DesignRequestListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="DESIGN-API-002: List own design requests",
)
def list_design_requests(
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List customer's own design requests."""
    requests, total = DesignService.list_requests(
        db=db,
        user=current_user,
        page=page,
        page_size=page_size,
    )
    return {
        "data": [_serialize_design(r, db) for r in requests],
        "total": total,
        "page": page,
        "page_size": page_size,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{id}",
    response_model=DesignRequestResponse,
    status_code=http_status.HTTP_200_OK,
    summary="DESIGN-API-003: Design request detail",
)
def get_design_request(
    id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer design request detail with strict 404 IDOR protection."""
    req = DesignService.get_request(
        db=db,
        user=current_user,
        request_id=id,
    )
    return {
        "data": _serialize_design(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/cancel",
    response_model=DesignRequestResponse,
    status_code=http_status.HTTP_200_OK,
    summary="DESIGN-API-004: Cancel design request",
)
def cancel_design_request(
    id: str,
    body: ManufacturingCancelRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Cancel design request (mirrors MFG cancellation rules)."""
    req = DesignService.cancel_request(
        db=db,
        user=current_user,
        request_id=id,
        reason=body.reason,
    )
    return {
        "data": _serialize_design(req, db),
        "request_id": str(uuid.uuid4()),
    }



@router.get(
    "/{id}/clarifications",
    response_model=ClarificationListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="DESIGN-API-005: List design clarifications",
)
def list_design_clarifications(
    id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """List clarifications for a design request."""
    clarifications = DesignService.list_clarifications(
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
    summary="DESIGN-API-005: Respond to design clarification",
)
def respond_design_clarification(
    id: str,
    clarification_id: str,
    body: ClarificationRespondRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer responds to a design clarification item."""
    clarification = DesignService.respond_clarification(
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


@router.post(
    "/{id}/start-manufacturing",
    status_code=http_status.HTTP_200_OK,
    summary="DESIGN-API-006: Generate manufacturing draft from design deliverables",
)
def start_manufacturing_from_design(
    id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Convenience action: creates a DRAFT MFG-API-001 payload pre-filled with delivered file IDs.
    INVARIANT: Does NOT create or persist a ManufacturingRequest in the database.
    """
    draft = DesignService.start_manufacturing_draft(
        db=db,
        user=current_user,
        request_id=id,
    )
    return {
        "data": draft,
        "request_id": str(uuid.uuid4()),
    }
