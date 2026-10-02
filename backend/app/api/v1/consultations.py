import uuid
import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser
from app.services.consultation import ConsultationService
from app.models.project import ProjectFile
from app.core.rate_limit import RateLimiter
from app.schemas.service_requests import (

    ConsultationCreate,
    ConsultationResponse,
    ConsultationListResponse,
    ConsultationClarificationCreate,
    ConsultationClarificationRespond,
    ConsultationClarificationListResponse,
)

router = APIRouter()


def _serialize_consultation(req, db: Session) -> Dict[str, Any]:
    # Query files
    files = db.query(ProjectFile).filter(
        ProjectFile.association_type == "consultation",
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
        "topic": req.topic,
        "description": req.description,
        "status": req.status,
        "converted_quote_id": str(req.converted_quote_id) if req.converted_quote_id else None,
        "admin_response": req.admin_response,
        "files": file_list,
        "created_at": req.created_at.isoformat() if req.created_at else "",
        "updated_at": req.updated_at.isoformat() if req.updated_at else "",
    }


@router.post(
    "",
    response_model=ConsultationResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="CONSULT-API-001: Submit consultation request",
    dependencies=[Depends(RateLimiter(limit=10, window_seconds=3600, key_prefix="rl:consult_req", scope="user"))],
)
def submit_consultation(

    body: ConsultationCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Submit a lightweight, asynchronous consultation request."""
    req = ConsultationService.submit_consultation(
        db=db,
        user=current_user,
        topic=body.topic,
        description=body.description,
        file_ids=body.file_ids,
    )
    return {
        "data": _serialize_consultation(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "",
    response_model=ConsultationListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="CONSULT-API-002: List own consultations",
)
def list_consultations(
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List customer's own consultation requests."""
    requests, total = ConsultationService.list_consultations(
        db=db,
        user=current_user,
        page=page,
        page_size=page_size,
    )
    return {
        "data": [_serialize_consultation(r, db) for r in requests],
        "total": total,
        "page": page,
        "page_size": page_size,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{id}",
    response_model=ConsultationResponse,
    status_code=http_status.HTTP_200_OK,
    summary="CONSULT-API-003: Consultation detail",
)
def get_consultation(
    id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer consultation detail with strict 404 IDOR protection."""
    req = ConsultationService.get_consultation(
        db=db,
        user=current_user,
        consultation_id=id,
    )
    return {
        "data": _serialize_consultation(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/resolve",
    response_model=ConsultationResponse,
    status_code=http_status.HTTP_200_OK,
    summary="CONSULT-API-004: Customer marks consultation resolved",
)
def resolve_consultation(
    id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer marks their own consultation as resolved/completed."""
    req = ConsultationService.resolve_consultation(
        db=db,
        user=current_user,
        consultation_id=id,
    )
    return {
        "data": _serialize_consultation(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{id}/clarifications",
    response_model=ConsultationClarificationListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="CONSULT-API-005: Discussion thread",
)
def list_consultation_clarifications(
    id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """List discussion/clarifications for a consultation."""
    clarifications = ConsultationService.list_clarifications(
        db=db,
        user=current_user,
        consultation_id=id,
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
    summary="CONSULT-API-006: Respond in discussion thread",
)
def respond_consultation_clarification(
    id: str,
    clarification_id: str,
    body: ConsultationClarificationRespond,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer responds to a question in the consultation discussion thread."""
    ans_text = body.text or body.response_text or ""
    clarification = ConsultationService.respond_clarification(
        db=db,
        user=current_user,
        consultation_id=id,
        clarification_id=clarification_id,
        text=ans_text,
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
