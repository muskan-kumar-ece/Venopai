import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Request, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser, CurrentAdmin, OptionalCurrentUser
from app.core.exceptions import get_request_id, APIException
from app.schemas.feedback import FeedbackCreate, FeedbackAdminUpdate
from app.services.feedback import FeedbackService

router = APIRouter()
admin_router = APIRouter()


@router.post("", status_code=status.HTTP_201_CREATED, summary="Submit customer feedback or issue report")
def submit_feedback(
    body: FeedbackCreate,
    request: Request,
    user: OptionalCurrentUser = None,
    db: Session = Depends(get_db),
):
    """Submit feedback, bug report, or feature request.
    Can be submitted anonymously (guest) or linked to the current customer account."""
    feedback = FeedbackService.create_feedback(
        db=db,
        data=body.model_dump(),
        user=user,
    )
    formatted = FeedbackService.format_feedback_dict(feedback, is_admin=False)
    return {
        "data": formatted,
        "message": "Feedback submitted successfully. Thank you for helping improve VenopAI.",
        "request_id": get_request_id(request),
    }


@router.get("", summary="List current customer's feedback submissions (paginated)")
def get_my_feedbacks(
    user: CurrentUser,
    request: Request,
    status: Optional[str] = Query(None),
    feedback_type: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """IDOR-safe listing of feedback submitted by the authenticated customer."""
    items, meta = FeedbackService.list_user_feedbacks(
        db=db,
        user=user,
        status=status,
        feedback_type=feedback_type,
        page=page,
        page_size=page_size,
    )
    return {
        "data": items,
        "pagination": meta,
        "request_id": get_request_id(request),
    }


@router.get("/{feedback_id}", summary="Get current customer's feedback detail")
def get_my_feedback_detail(
    feedback_id: str,
    user: CurrentUser,
    request: Request,
    db: Session = Depends(get_db),
):
    """IDOR-safe detail view of customer's feedback."""
    try:
        f_uuid = uuid.UUID(feedback_id)
    except Exception:
        raise APIException("Invalid feedback ID format", code="INVALID_ID", status_code=400)

    data = FeedbackService.get_user_feedback(
        db=db,
        feedback_id=f_uuid,
        user=user,
    )
    return {
        "data": data,
        "request_id": get_request_id(request),
    }


# =========================================================================
# ADMIN ROUTERS
# =========================================================================

@admin_router.get("/stats", summary="Admin Feedback Triage KPIs & Statistics")
def get_feedback_stats(
    admin: CurrentAdmin,
    request: Request,
    db: Session = Depends(get_db),
):
    """Aggregate statistics for admin feedback triage dashboard."""
    stats = FeedbackService.admin_get_stats(db=db)
    return {
        "data": stats,
        "request_id": get_request_id(request),
    }


@admin_router.get("", summary="Admin list all feedback items (paginated & filtered)")
def admin_list_feedbacks(
    admin: CurrentAdmin,
    request: Request,
    status: Optional[str] = Query(None),
    feedback_type: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Filterable, searchable list of all platform feedback submissions."""
    items, meta = FeedbackService.admin_list_feedbacks(
        db=db,
        status=status,
        feedback_type=feedback_type,
        priority=priority,
        search=search,
        page=page,
        page_size=page_size,
    )
    return {
        "data": items,
        "pagination": meta,
        "request_id": get_request_id(request),
    }


@admin_router.get("/{feedback_id}", summary="Admin get feedback detail")
def admin_get_feedback(
    feedback_id: str,
    admin: CurrentAdmin,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        f_uuid = uuid.UUID(feedback_id)
    except Exception:
        raise APIException("Invalid feedback ID format", code="INVALID_ID", status_code=400)

    data = FeedbackService.admin_get_feedback(
        db=db,
        feedback_id=f_uuid,
    )
    return {
        "data": data,
        "request_id": get_request_id(request),
    }


@admin_router.patch("/{feedback_id}", summary="Admin update feedback status, notes, or resolution")
def admin_update_feedback(
    feedback_id: str,
    body: FeedbackAdminUpdate,
    admin: CurrentAdmin,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        f_uuid = uuid.UUID(feedback_id)
    except Exception:
        raise APIException("Invalid feedback ID format", code="INVALID_ID", status_code=400)

    data = FeedbackService.admin_update_feedback(
        db=db,
        feedback_id=f_uuid,
        data=body.model_dump(exclude_unset=True),
        admin_user=admin,
    )
    return {
        "data": data,
        "message": "Feedback record updated successfully.",
        "request_id": get_request_id(request),
    }
