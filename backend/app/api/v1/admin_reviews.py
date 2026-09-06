import uuid as uuid_lib
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from uuid import UUID

from app.api.deps import get_db, CurrentAdmin
from app.core.exceptions import get_request_id
from app.schemas.review import ReviewOut, AdminHideReview
from app.models.engagement import Review
from app.models.user import AuditEvent, User

router = APIRouter()

REVIEW_MODERATION_ROLES = ("SUPER_ADMIN", "SUPPORT_EXECUTIVE")


def _require_moderation_role(admin: User):
    """Enforce strict RBAC: only SUPPORT_EXECUTIVE and SUPER_ADMIN can moderate reviews.
    MANUFACTURING_MANAGER, ORDER_MANAGER, and FINANCE_MANAGER receive 403 Forbidden."""
    if admin.role not in REVIEW_MODERATION_ROLES and not (admin.is_superuser and not admin.role):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "FORBIDDEN",
                "message": "Only SUPPORT_EXECUTIVE or SUPER_ADMIN may moderate reviews.",
            },
        )


@router.get("", summary="ADMIN-REVIEW-API-001: Moderation queue — all reviews")
def get_all_reviews(
    admin: CurrentAdmin,
    request: Request,
    db: Session = Depends(get_db),
):
    """Return all reviews including hidden ones for moderation. Accessible strictly by SUPPORT_EXECUTIVE and SUPER_ADMIN."""
    _require_moderation_role(admin)
    reviews = db.query(Review).order_by(Review.created_at.desc()).all()
    return {
        "data": [ReviewOut.model_validate(r) for r in reviews],
        "request_id": get_request_id(request),
    }


@router.post("/{review_id}/hide", summary="ADMIN-REVIEW-API-002: Hide a review (requires reason)")
def hide_review(
    review_id: UUID,
    body: AdminHideReview,
    admin: CurrentAdmin,
    request: Request,
    db: Session = Depends(get_db),
):
    """Hide a review from public visibility. Retains the underlying record.
    Requires a moderation reason. Writes an AuditEvent. Strict RBAC enforced."""
    _require_moderation_role(admin)
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    review.is_visible = False
    review.moderation_reason = body.reason

    audit = AuditEvent(
        id=uuid_lib.uuid4(),
        user_id=admin.id,
        action="review.hide",
        entity_type="review",
        entity_id=review_id,
        details=json.dumps({"reason": body.reason}),
    )
    db.add(audit)
    db.commit()
    db.refresh(review)
    return {
        "data": ReviewOut.model_validate(review),
        "request_id": get_request_id(request),
    }


@router.post("/{review_id}/restore", summary="ADMIN-REVIEW-API-003: Restore a hidden review")
def restore_review(
    review_id: UUID,
    admin: CurrentAdmin,
    request: Request,
    db: Session = Depends(get_db),
):
    """Restore a previously hidden review to public visibility. Writes an AuditEvent. Strict RBAC enforced."""
    _require_moderation_role(admin)
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    review.is_visible = True
    review.moderation_reason = None

    audit = AuditEvent(
        id=uuid_lib.uuid4(),
        user_id=admin.id,
        action="review.restore",
        entity_type="review",
        entity_id=review_id,
        details=json.dumps({}),
    )
    db.add(audit)
    db.commit()
    db.refresh(review)
    return {
        "data": ReviewOut.model_validate(review),
        "request_id": get_request_id(request),
    }
