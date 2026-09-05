import uuid
import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser, CurrentAdmin
from app.services.quote import QuoteService
from app.services.catalog import _rupees
from app.schemas.quote import (
    AdminQuoteCreateRequest,
    AdminQuoteDraftUpdateRequest,
    AdminQuoteReviseRequest,
    CustomerQuoteRejectRequest,
    QuoteDetailResponse,
    QuoteListResponse,
    QuoteVersionListResponse,
    QuoteApprovalListResponse,
)

router = APIRouter()
admin_router = APIRouter()


# ----------------------------------------------------------------------
# Customer Quote Endpoints
# ----------------------------------------------------------------------

@router.get(
    "",
    response_model=QuoteListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="QUOTE-API-001: List customer quotes across all requests",
)
def list_quotes(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """List quotes across all requests for the logged-in customer."""
    items = QuoteService.list_quotes(db=db, user=current_user)
    return {
        "data": items,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{quote_id}",
    response_model=QuoteDetailResponse,
    status_code=http_status.HTTP_200_OK,
    summary="QUOTE-API-002: Fetch current non-superseded quote detail",
)
def get_quote_detail(
    quote_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Get the current latest version's full details (IDOR safe: 404 for other customers)."""
    quote, version = QuoteService.get_quote_detail(db=db, user=current_user, quote_id=quote_id)
    line_items = json.loads(version.line_items) if version.line_items else []
    
    return {
        "data": {
            "id": str(quote.id),
            "request_type": quote.request_type,
            "request_id": str(quote.request_id) if quote.request_id else "",
            "project_id": str(quote.project_id) if quote.project_id else None,
            "status": quote.status,
            "current_version": {
                "id": str(version.id),
                "version_number": version.version,
                "status": version.status,
                "scope_summary": version.scope_summary,
                "line_items": line_items,
                "subtotal": _rupees(version.subtotal_paise),
                "subtotal_paise": version.subtotal_paise,
                "tax": {
                    "type": version.tax_type or "GST",
                    "amount": _rupees(version.tax_paise),
                    "amount_paise": version.tax_paise,
                },
                "shipping_amount": _rupees(version.shipping_amount_paise),
                "shipping_amount_paise": version.shipping_amount_paise,
                "total": _rupees(version.total_amount),
                "total_paise": version.total_amount,
                "estimated_timeline": version.estimated_timeline,
                "valid_until": version.valid_until.isoformat() if version.valid_until else None,
                "terms": version.terms,
                "created_at": version.created_at.isoformat() if version.created_at else "",
                "approval": None,
            },
            "created_at": quote.created_at.isoformat() if quote.created_at else "",
            "updated_at": quote.updated_at.isoformat() if quote.updated_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{quote_id}/versions",
    response_model=QuoteVersionListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="QUOTE-API-003: Version history list in reverse-chronological order",
)
def list_quote_versions(
    quote_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """List all versions of this quote (historical and current)."""
    versions = QuoteService.list_quote_versions(db=db, user=current_user, quote_id=quote_id)
    results = []
    for v in versions:
        line_items = json.loads(v.line_items) if v.line_items else []
        results.append({
            "id": str(v.id),
            "version_number": v.version,
            "status": v.status,
            "scope_summary": v.scope_summary,
            "line_items": line_items,
            "subtotal": _rupees(v.subtotal_paise),
            "subtotal_paise": v.subtotal_paise,
            "tax": {
                "type": v.tax_type or "GST",
                "amount": _rupees(v.tax_paise),
                "amount_paise": v.tax_paise,
            },
            "shipping_amount": _rupees(v.shipping_amount_paise),
            "shipping_amount_paise": v.shipping_amount_paise,
            "total": _rupees(v.total_amount),
            "total_paise": v.total_amount,
            "estimated_timeline": v.estimated_timeline,
            "valid_until": v.valid_until.isoformat() if v.valid_until else None,
            "terms": v.terms,
            "created_at": v.created_at.isoformat() if v.created_at else "",
            "approval": None,
        })
    return {
        "data": results,
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{quote_id}/versions/{version_id}",
    status_code=http_status.HTTP_200_OK,
    summary="QUOTE-API-004: Specific version detail (read-only)",
)
def get_specific_version_detail(
    quote_id: str,
    version_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Fetch read-only details of a specific historical or superseded version."""
    v = QuoteService.get_specific_version(db=db, user=current_user, quote_id=quote_id, version_id=version_id)
    line_items = json.loads(v.line_items) if v.line_items else []
    return {
        "data": {
            "id": str(v.id),
            "version_number": v.version,
            "status": v.status,
            "scope_summary": v.scope_summary,
            "line_items": line_items,
            "subtotal": _rupees(v.subtotal_paise),
            "subtotal_paise": v.subtotal_paise,
            "tax": {
                "type": v.tax_type or "GST",
                "amount": _rupees(v.tax_paise),
                "amount_paise": v.tax_paise,
            },
            "shipping_amount": _rupees(v.shipping_amount_paise),
            "shipping_amount_paise": v.shipping_amount_paise,
            "total": _rupees(v.total_amount),
            "total_paise": v.total_amount,
            "estimated_timeline": v.estimated_timeline,
            "valid_until": v.valid_until.isoformat() if v.valid_until else None,
            "terms": v.terms,
            "created_at": v.created_at.isoformat() if v.created_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{quote_id}/approve",
    response_model=QuoteDetailResponse,
    status_code=http_status.HTTP_200_OK,
    summary="QUOTE-API-005: Approve the current quote version",
)
def approve_quote(
    quote_id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer approves the current version (transitions request quote_ready -> payment_pending)."""
    quote, version = QuoteService.approve_quote(db=db, user=current_user, quote_id=quote_id)
    line_items = json.loads(version.line_items) if version.line_items else []
    return {
        "data": {
            "id": str(quote.id),
            "request_type": quote.request_type,
            "request_id": str(quote.request_id) if quote.request_id else "",
            "project_id": str(quote.project_id) if quote.project_id else None,
            "status": quote.status,
            "current_version": {
                "id": str(version.id),
                "version_number": version.version,
                "status": version.status,
                "scope_summary": version.scope_summary,
                "line_items": line_items,
                "subtotal": _rupees(version.subtotal_paise),
                "subtotal_paise": version.subtotal_paise,
                "tax": {
                    "type": version.tax_type or "GST",
                    "amount": _rupees(version.tax_paise),
                    "amount_paise": version.tax_paise,
                },
                "shipping_amount": _rupees(version.shipping_amount_paise),
                "shipping_amount_paise": version.shipping_amount_paise,
                "total": _rupees(version.total_amount),
                "total_paise": version.total_amount,
                "estimated_timeline": version.estimated_timeline,
                "valid_until": version.valid_until.isoformat() if version.valid_until else None,
                "terms": version.terms,
                "created_at": version.created_at.isoformat() if version.created_at else "",
            },
            "created_at": quote.created_at.isoformat() if quote.created_at else "",
            "updated_at": quote.updated_at.isoformat() if quote.updated_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{quote_id}/reject",
    response_model=QuoteDetailResponse,
    status_code=http_status.HTTP_200_OK,
    summary="QUOTE-API-006: Reject the current quote version",
)
def reject_quote(
    quote_id: str,
    body: CustomerQuoteRejectRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Customer rejects quote version (request returns to clarification_needed for renegotiation)."""
    quote, version = QuoteService.reject_quote(db=db, user=current_user, quote_id=quote_id, reason=body.reason)
    line_items = json.loads(version.line_items) if version.line_items else []
    return {
        "data": {
            "id": str(quote.id),
            "request_type": quote.request_type,
            "request_id": str(quote.request_id) if quote.request_id else "",
            "project_id": str(quote.project_id) if quote.project_id else None,
            "status": quote.status,
            "current_version": {
                "id": str(version.id),
                "version_number": version.version,
                "status": version.status,
                "scope_summary": version.scope_summary,
                "line_items": line_items,
                "subtotal": _rupees(version.subtotal_paise),
                "subtotal_paise": version.subtotal_paise,
                "tax": {
                    "type": version.tax_type or "GST",
                    "amount": _rupees(version.tax_paise),
                    "amount_paise": version.tax_paise,
                },
                "shipping_amount": _rupees(version.shipping_amount_paise),
                "shipping_amount_paise": version.shipping_amount_paise,
                "total": _rupees(version.total_amount),
                "total_paise": version.total_amount,
                "estimated_timeline": version.estimated_timeline,
                "valid_until": version.valid_until.isoformat() if version.valid_until else None,
                "terms": version.terms,
                "created_at": version.created_at.isoformat() if version.created_at else "",
            },
            "created_at": quote.created_at.isoformat() if quote.created_at else "",
            "updated_at": quote.updated_at.isoformat() if quote.updated_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


# ----------------------------------------------------------------------
# Admin Quote Endpoints
# ----------------------------------------------------------------------

@admin_router.post(
    "",
    status_code=http_status.HTTP_201_CREATED,
    summary="ADMIN-QUOTE-API-001: Create quote draft",
)
def admin_create_quote(
    body: AdminQuoteCreateRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin creates a quote in draft state against a service request."""
    quote = QuoteService.create_quote(
        db=db,
        admin_user=admin,
        request_type=body.request_type,
        request_id=body.request_id,
        line_items=[item.model_dump() for item in body.line_items],
        shipping_amount=body.shipping_amount or "0.00",
        estimated_timeline=body.estimated_timeline,
        valid_until=body.valid_until,
        terms=body.terms,
        scope_summary=body.scope_summary,
    )
    return {
        "data": {"id": str(quote.id), "status": quote.status},
        "request_id": str(uuid.uuid4()),
    }


@admin_router.post(
    "/{quote_id}/send",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-QUOTE-API-003: Send quote to customer",
)
def admin_send_quote(
    quote_id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin transitions quote from draft to sent; associated request moves to quote_ready."""
    quote = QuoteService.send_quote(db=db, admin_user=admin, quote_id=quote_id)
    return {
        "data": {"id": str(quote.id), "status": quote.status},
        "request_id": str(uuid.uuid4()),
    }


@admin_router.post(
    "/{quote_id}/revise",
    status_code=http_status.HTTP_201_CREATED,
    summary="ADMIN-QUOTE-API-004: Revise quote with immutable versioning",
)
def admin_revise_quote(
    quote_id: str,
    body: AdminQuoteReviseRequest,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Creates a new version and marks prior version superseded."""
    new_v = QuoteService.revise_quote(
        db=db,
        admin_user=admin,
        quote_id=quote_id,
        line_items=[item.model_dump() for item in body.line_items],
        shipping_amount=body.shipping_amount or "0.00",
        estimated_timeline=body.estimated_timeline,
        valid_until=body.valid_until,
        terms=body.terms,
        scope_summary=body.scope_summary,
    )
    v_data = {
        "id": str(new_v.id),
        "version_number": new_v.version,
        "status": new_v.status,
        "subtotal": _rupees(new_v.subtotal_paise),
        "total": _rupees(new_v.total_amount),
    }
    return {
        "data": {
            **v_data,
            "current_version": v_data,
        },
        "request_id": str(uuid.uuid4()),
    }
