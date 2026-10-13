import json
import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentAdmin
from app.services.software import SoftwareService
from app.models.project import ProjectFile
from app.schemas.service_requests import (
    SoftwareRequestResponse,
    SoftwareRequestListResponse,
)
from app.schemas.manufacturing import (
    AdminRaiseClarificationRequest,
    AdminStatusUpdateRequest,
    AdminResolveCancellationRequest,
)

router = APIRouter()


def _serialize_software_admin(req, db: Session) -> Dict[str, Any]:
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

    extra_fields: Dict[str, Any] = {}
    if req.additional_notes:
        try:
            extra_fields = json.loads(req.additional_notes)
            if not isinstance(extra_fields, dict):
                extra_fields = {}
        except Exception:
            extra_fields = {}

    clar_list = []
    open_clars = 0
    if hasattr(req, "clarifications") and req.clarifications:
        for c in req.clarifications:
            if c.status == "awaiting_response":
                open_clars += 1
            att_files = []
            if c.attached_file_ids:
                try:
                    att_files = json.loads(c.attached_file_ids)
                except Exception:
                    pass
            clar_list.append({
                "id": str(c.id),
                "question": c.question,
                "status": c.status,
                "response_text": c.response_text,
                "raised_at": c.raised_at.isoformat() if c.raised_at else "",
                "responded_at": c.responded_at.isoformat() if c.responded_at else None,
                "attached_file_ids": att_files,
            })

    update_list = []
    if hasattr(req, "status_updates") and req.status_updates:
        for u in req.status_updates:
            update_list.append({
                "id": str(u.id),
                "note": u.note,
                "created_at": u.created_at.isoformat() if u.created_at else "",
            })

    active_quote = None
    if hasattr(req, "quotes") and req.quotes:
        for q in reversed(req.quotes):
            if q.status in ("ready", "approved", "draft", "payment_pending", "paid", "sent"):
                latest_v = q.versions[-1] if hasattr(q, "versions") and q.versions else None
                line_items_data = []
                total_paise = 0
                if latest_v:
                    total_paise = getattr(latest_v, "total_amount", 0)
                    try:
                        line_items_data = json.loads(latest_v.line_items) if isinstance(latest_v.line_items, str) else (latest_v.line_items or [])
                    except Exception:
                        line_items_data = []
                active_quote = {
                    "id": str(q.id),
                    "status": q.status,
                    "total_paise": total_paise,
                    "line_items": line_items_data,
                }
                break

    return {
        "id": str(req.id),
        "user_id": str(req.user_id),
        "project_id": str(req.project_id) if req.project_id else None,
        "title": req.title,
        "project_description": req.project_description,
        "project_overview": req.project_description,
        "requirements": req.requirements,
        "platform_technology": req.platform_technology,
        "hardware_platform": extra_fields.get("hardware_platform") or req.platform_technology,
        "target_mcu": extra_fields.get("hardware_platform") or req.platform_technology,
        "programming_language": extra_fields.get("programming_language"),
        "os_framework": extra_fields.get("os_framework"),
        "interfaces_protocols": extra_fields.get("interfaces_protocols"),
        "repository_url": extra_fields.get("repository_url"),
        "deliverables_required": extra_fields.get("deliverables_required") or req.requirements,
        "target_timeline": extra_fields.get("target_timeline"),
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
        "clarifications": clar_list,
        "status_updates": update_list,
        "active_quote": active_quote,
        "open_clarifications_count": open_clars,
    }


@router.get(
    "/cancellation-review-queue",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SW-API-008: List software requests in cancellation review queue",
)
def admin_list_software_cancellation_queue(
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """List software requests flagged with cancellation_requested == True."""
    SoftwareService._check_admin_role(admin)
    from app.models.project import SoftwareRequest
    items = db.query(SoftwareRequest).filter(
        SoftwareRequest.cancellation_requested == True,
    ).order_by(SoftwareRequest.updated_at.desc()).all()
    results = []
    for r in items:
        results.append({
            "id": str(r.id),
            "title": r.title,
            "project_type": r.project_type,
            "status": r.status,
            "cancellation_requested": True,
            "cancellation_reason": r.cancellation_reason,
            "customer_email": r.user.email if r.user else None,
            "created_at": r.created_at.isoformat() if r.created_at else "",
            "updated_at": r.updated_at.isoformat() if r.updated_at else "",
        })
    return {
        "data": results,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SW-API-001: Queue view for software requests",
)
def admin_list_software_requests(
    admin: CurrentAdmin,
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Admin queue view of software/firmware requests."""
    requests, total = SoftwareService.admin_list_queue(
        db=db,
        admin_user=admin,
        status=status,
        page=page,
        page_size=page_size,
    )
    return {
        "data": [_serialize_software_admin(r, db) for r in requests],
        "total": total,
        "page": page,
        "page_size": page_size,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{id}",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SW-API-002: Admin software request detail",
)
def admin_get_software_request(
    id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin full detail view of software/firmware request."""
    req = SoftwareService.admin_get_request(
        db=db,
        admin_user=admin,
        request_id=id,
    )
    return {
        "data": _serialize_software_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/confirm-requirements",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SW-API-003: Confirm software requirements",
)
def admin_confirm_software_requirements(
    id: str,
    admin: CurrentAdmin,
    notes: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Transitions software request to requirements_confirmed."""
    req = SoftwareService.confirm_requirements(
        db=db,
        admin_user=admin,
        request_id=id,
        notes=notes,
    )
    return {
        "data": _serialize_software_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/clarifications",
    status_code=http_status.HTTP_201_CREATED,
    summary="ADMIN-SW-API-004: Raise software clarification question",
)
def admin_raise_software_clarification(
    id: str,
    body: AdminRaiseClarificationRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin raises clarification question on software request."""
    clarification = SoftwareService.raise_clarification(
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
    summary="Resolve software clarification question",
)
def admin_resolve_software_clarification(
    id: str,
    clarification_id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    clar = SoftwareService.resolve_clarification(
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
    summary="Update software request status",
)
def admin_update_software_status(
    id: str,
    body: Dict[str, Any],
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin updates software request status."""
    req = SoftwareService.admin_update_status(
        db=db,
        admin_user=admin,
        request_id=id,
        status=body.get("status"),
        internal_notes=body.get("internal_notes"),
    )
    return {
        "data": _serialize_software_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/status-update",
    status_code=http_status.HTTP_201_CREATED,
    summary="ADMIN-SW-API-005: Post software execution status update",
)
@router.post(
    "/{id}/updates",
    status_code=http_status.HTTP_201_CREATED,
    include_in_schema=False,
)
def admin_post_software_status_update(
    id: str,
    body: AdminStatusUpdateRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin posts plain-language execution update note."""
    status_update = SoftwareService.post_status_update(
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
    summary="ADMIN-SW-API-006: Complete software execution",
)
def admin_complete_software_execution(
    id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Transitions in_progress -> completed_execution."""
    req = SoftwareService.complete_execution(
        db=db,
        admin_user=admin,
        request_id=id,
    )
    return {
        "data": _serialize_software_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/complete",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-SW-API-007: Mark software request completed",
)
def admin_complete_software_request(
    id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Transitions delivered -> completed."""
    req = SoftwareService.complete_request(
        db=db,
        admin_user=admin,
        request_id=id,
    )
    return {
        "data": _serialize_software_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/resolve-cancellation",
    status_code=http_status.HTTP_200_OK,
    summary="Resolve software cancellation request",
)
def admin_resolve_software_cancellation(
    id: str,
    body: AdminResolveCancellationRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin resolves post-execution cancellation."""
    req = SoftwareService.resolve_cancellation(
        db=db,
        admin_user=admin,
        request_id=id,
        decision=body.decision,
        refund_amount=body.refund_amount,
        notes=body.notes,
    )
    return {
        "data": _serialize_software_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }
