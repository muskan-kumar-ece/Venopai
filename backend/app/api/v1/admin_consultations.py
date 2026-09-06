import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentAdmin
from app.services.consultation import ConsultationService
from app.models.project import ProjectFile
from app.schemas.service_requests import (
    ConsultationResponse,
    ConsultationListResponse,
    AdminConsultationRespond,
    AdminConsultationConvertToQuote,
    AdminConsultationClose,
)

router = APIRouter()


def _serialize_consultation_admin(req, db: Session) -> Dict[str, Any]:
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
        "internal_notes": req.internal_notes,
        "files": file_list,
        "created_at": req.created_at.isoformat() if req.created_at else "",
        "updated_at": req.updated_at.isoformat() if req.updated_at else "",
    }


@router.get(
    "",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-CONSULT-API-001: Queue view for consultations",
)
def admin_list_consultations(
    admin: CurrentAdmin,
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Admin queue view of consultation requests."""
    requests, total = ConsultationService.admin_list_queue(
        db=db,
        admin_user=admin,
        status=status,
        page=page,
        page_size=page_size,
    )
    return {
        "data": [_serialize_consultation_admin(r, db) for r in requests],
        "total": total,
        "page": page,
        "page_size": page_size,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{id}",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-CONSULT-API-001: Admin consultation detail",
)
def admin_get_consultation(
    id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin full detail view of consultation."""
    req = ConsultationService.admin_get_consultation(
        db=db,
        admin_user=admin,
        consultation_id=id,
    )
    return {
        "data": _serialize_consultation_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/respond",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-CONSULT-API-003: Post response to consultation",
)
def admin_respond_consultation(
    id: str,
    body: AdminConsultationRespond,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin posts response or questions to customer consultation."""
    resp_text = body.response or body.admin_response or ""
    req = ConsultationService.admin_respond(
        db=db,
        admin_user=admin,
        consultation_id=id,
        response_text=resp_text,
        internal_notes=body.internal_notes,
    )
    return {
        "data": _serialize_consultation_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/convert-to-quote",
    status_code=http_status.HTTP_201_CREATED,
    summary="ADMIN-CONSULT-API-002: Convert consultation to billable quote",
)
def admin_convert_consultation_to_quote(
    id: str,
    body: AdminConsultationConvertToQuote,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Converts a consultation into a billable engineering engagement by creating a Quote."""
    quote = ConsultationService.admin_convert_to_quote(
        db=db,
        admin_user=admin,
        consultation_id=id,
        line_items=body.line_items,
        shipping_amount=body.shipping_amount or "0.00",
        destination_state=body.destination_state,
        estimated_timeline=body.estimated_timeline,
        valid_until=body.valid_until,
        terms=body.terms,
        scope_summary=body.scope_summary,
    )
    return {
        "data": {
            "id": str(quote.id),
            "quote_id": str(quote.id),
            "request_id": str(id),
            "request_type": "consultation",
            "status": quote.status,
            "created_at": quote.created_at.isoformat() if quote.created_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/close",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-CONSULT-API-004: Mark consultation closed",
)
def admin_close_consultation(
    id: str,
    body: AdminConsultationClose,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin marks consultation closed."""
    req = ConsultationService.admin_close(
        db=db,
        admin_user=admin,
        consultation_id=id,
        notes=body.notes,
    )
    return {
        "data": _serialize_consultation_admin(req, db),
        "request_id": str(uuid.uuid4()),
    }
