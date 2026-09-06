import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentAdmin
from app.services.design import DesignService
from app.models.project import ProjectFile
from app.schemas.service_requests import (
    DesignRequestResponse,
    DesignRequestListResponse,
)
from app.schemas.manufacturing import (
    AdminRaiseClarificationRequest,
    AdminStatusUpdateRequest,
    AdminResolveCancellationRequest,
)

router = APIRouter()


def _serialize_design_admin(req, db: Session) -> Dict[str, Any]:
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
        "cancellation_reason": req.cancellation_reason,
        "cancellation_decision": req.cancellation_decision,
        "cancellation_refund_paise": req.cancellation_refund_paise,
        "cancellation_notes": req.cancellation_notes,
        "internal_notes": req.internal_notes,
        "files": file_list,
        "created_at": req.created_at.isoformat() if req.created_at else "",
        "updated_at": req.updated_at.isoformat() if req.updated_at else "",
    }


@router.get(
    "",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-DESIGN-API-001: Queue view for design requests",
)
def admin_list_design_requests(
    admin: CurrentAdmin,
    status: Optional[str] = Query(None),
    design_scope: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Admin queue view of design requests."""
    requests, total = DesignService.admin_list_queue(
        db=db,
        admin_user=admin,
        status=status,
        design_scope=design_scope,
        page=page,
        page_size=page_size,
    )
    return {
        "data": [_serialize_design_admin(r, db) for r in requests],
        "total": total,
        "page": page,
        "page_size": page_size,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{id}",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-DESIGN-API-002: Admin design request detail",
)
def admin_get_design_request(
    id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin full detail view of design request."""
    req = DesignService.admin_get_request(
        db=db,
        admin_user=admin,
        request_id=id,
    )
    return {
        "data": _serialize_design_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/confirm-requirements",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-DESIGN-API-003: Confirm design requirements",
)
def admin_confirm_design_requirements(
    id: str,
    admin: CurrentAdmin,
    notes: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Transitions design request to requirements_confirmed."""
    req = DesignService.confirm_requirements(
        db=db,
        admin_user=admin,
        request_id=id,
        notes=notes,
    )
    return {
        "data": _serialize_design_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/clarifications",
    status_code=http_status.HTTP_201_CREATED,
    summary="ADMIN-DESIGN-API-004: Raise design clarification question",
)
def admin_raise_design_clarification(
    id: str,
    body: AdminRaiseClarificationRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin raises clarification question on design request."""
    clarification = DesignService.raise_clarification(
        db=db,
        admin_user=admin,
        request_id=id,
        question=body.question,
    )
    return {
        "data": {
            "id": str(clarification.id),
            "request_id": str(clarification.request_id),
            "question": clarification.question,
            "raised_by_id": str(clarification.raised_by_id),
            "raised_at": clarification.raised_at.isoformat() if clarification.raised_at else "",
            "status": clarification.status,
        },
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/clarifications/{clarification_id}/resolve",
    status_code=http_status.HTTP_200_OK,
    summary="Resolve design clarification question",
)
def admin_resolve_design_clarification(
    id: str,
    clarification_id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    clar = DesignService.resolve_clarification(
        db=db,
        admin_user=admin,
        request_id=id,
        clarification_id=clarification_id,
    )
    return {
        "data": {
            "id": str(clar.id),
            "request_id": str(clar.request_id),
            "status": clar.status,
        },
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/status",
    status_code=http_status.HTTP_200_OK,
    summary="Update design request status",
)
def admin_update_design_status(
    id: str,
    body: Dict[str, Any],
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin updates design request status."""
    req = DesignService.admin_update_status(
        db=db,
        admin_user=admin,
        request_id=id,
        status=body.get("status"),
        internal_notes=body.get("internal_notes"),
    )
    return {
        "data": _serialize_design_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/status-update",
    status_code=http_status.HTTP_201_CREATED,
    summary="ADMIN-DESIGN-API-005: Post design execution status update",
)
@router.post(
    "/{id}/updates",
    status_code=http_status.HTTP_201_CREATED,
    include_in_schema=False,
)
def admin_post_design_status_update(
    id: str,
    body: AdminStatusUpdateRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin posts plain-language execution update note."""
    status_update = DesignService.post_status_update(
        db=db,
        admin_user=admin,
        request_id=id,
        note=body.note,
    )
    return {
        "data": {
            "id": str(status_update.id),
            "request_id": str(status_update.request_id),
            "author_id": str(status_update.author_id),
            "note": status_update.note,
            "created_at": status_update.created_at.isoformat() if status_update.created_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/complete-execution",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-DESIGN-API-006: Complete design execution",
)
def admin_complete_design_execution(
    id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Transitions in_progress -> completed_execution."""
    req = DesignService.complete_execution(
        db=db,
        admin_user=admin,
        request_id=id,
    )
    return {
        "data": _serialize_design_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/complete",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-DESIGN-API-007: Mark design request completed",
)
def admin_complete_design_request(
    id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Transitions delivered -> completed."""
    req = DesignService.complete_request(
        db=db,
        admin_user=admin,
        request_id=id,
    )
    return {
        "data": _serialize_design_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/resolve-cancellation",
    status_code=http_status.HTTP_200_OK,
    summary="Resolve design cancellation request",
)
def admin_resolve_design_cancellation(
    id: str,
    body: AdminResolveCancellationRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin resolves post-execution cancellation."""
    req = DesignService.resolve_cancellation(
        db=db,
        admin_user=admin,
        request_id=id,
        decision=body.decision,
        refund_amount=body.refund_amount,
        notes=body.notes,
    )
    return {
        "data": _serialize_design_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }
