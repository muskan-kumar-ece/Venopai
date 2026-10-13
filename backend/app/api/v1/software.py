import uuid
import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser
from app.services.software import SoftwareService
from app.models.project import ProjectFile
from app.core.rate_limit import RateLimiter
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
        "files": file_list,
        "created_at": req.created_at.isoformat() if req.created_at else "",
        "updated_at": req.updated_at.isoformat() if req.updated_at else "",
        "clarifications": clar_list,
        "status_updates": update_list,
        "active_quote": active_quote,
        "open_clarifications_count": open_clars,
    }


@router.post(
    "",
    response_model=SoftwareRequestResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="SW-API-001: Submit software/firmware request",
    dependencies=[Depends(RateLimiter(limit=10, window_seconds=3600, key_prefix="rl:software_req", scope="user"))],
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
