import uuid as uuid_lib
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from uuid import UUID

from app.api.deps import get_db, CurrentUser
from app.core.exceptions import get_request_id
from app.schemas.review import ReviewCreate, ReviewUpdate, ReviewOut
from app.models.engagement import Review
from app.models.order import Order, OrderItem
from app.models.project import (
    ManufacturingRequest,
    DesignRequest,
    ConsultationRequest,
    SoftwareRequest,
)

router = APIRouter()

REVIEW_EDIT_WINDOW_DAYS = 7

VALID_TARGET_TYPES = {
    "order_item",
    "manufacturing_request",
    "design_request",
    "consultation_request",
    "software_request",
}


def _verify_review_window_and_visibility(review: Review):
    """Enforce the authoritative 7-day edit/delete window and moderation lock."""
    if not review.is_visible:
        raise HTTPException(
            status_code=400,
            detail={"code": "REVIEW_MODERATED", "message": "Moderated reviews cannot be edited or deleted."},
        )
    now = datetime.now(timezone.utc)
    created = review.created_at
    if created and created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if created and (now - created).total_seconds() > REVIEW_EDIT_WINDOW_DAYS * 86400:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "EDIT_WINDOW_EXPIRED",
                "message": f"Reviews cannot be edited or deleted after {REVIEW_EDIT_WINDOW_DAYS} days.",
            },
        )


@router.post("", status_code=201, summary="REVIEW-API-001: Submit a review")
def create_review(
    current_user: CurrentUser,
    request: Request,
    review_in: ReviewCreate,
    db: Session = Depends(get_db),
):
    """Submit a target-specific review (REV-001 / REV-002).
    Supported target_types: order_item, manufacturing_request, design_request, consultation_request, software_request.
    One review per (customer, target) pair — duplicate returns 409 REVIEW_ALREADY_EXISTS."""

    target_type = review_in.target_type.strip().lower() if review_in.target_type else ""
    if target_type not in VALID_TARGET_TYPES:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_TARGET_TYPE",
                "message": f"Unsupported target_type: '{review_in.target_type}'. Must be one of: {', '.join(sorted(VALID_TARGET_TYPES))}",
            },
        )

    product_id = None

    # 1. Target-specific verification & eligibility
    if target_type == "order_item":
        order_item = db.query(OrderItem).filter(OrderItem.id == review_in.target_id).first()
        if not order_item:
            raise HTTPException(status_code=404, detail="Order item not found")
        
        order = db.query(Order).filter(Order.id == order_item.order_id).first()
        if not order or order.user_id != current_user.id:
            # Foreign customer's OrderItem -> 404
            raise HTTPException(status_code=404, detail="Order item not found")
        
        if (order.status or "").lower() != "delivered":
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "NOT_ELIGIBLE",
                    "message": "Only delivered order items may be reviewed.",
                },
            )
        product_id = order_item.product_id

    elif target_type == "manufacturing_request":
        mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == review_in.target_id).first()
        if not mfg or mfg.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Manufacturing request not found")
        if (mfg.status or "").lower() != "completed":
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "NOT_ELIGIBLE",
                    "message": "Only completed manufacturing requests may be reviewed.",
                },
            )

    elif target_type == "design_request":
        design = db.query(DesignRequest).filter(DesignRequest.id == review_in.target_id).first()
        if not design or design.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Design request not found")
        if (design.status or "").lower() != "completed":
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "NOT_ELIGIBLE",
                    "message": "Only completed design requests may be reviewed.",
                },
            )

    elif target_type == "software_request":
        sw = db.query(SoftwareRequest).filter(SoftwareRequest.id == review_in.target_id).first()
        if not sw or sw.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Software request not found")
        if (sw.status or "").lower() != "completed":
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "NOT_ELIGIBLE",
                    "message": "Only completed software requests may be reviewed.",
                },
            )

    elif target_type == "consultation_request":
        consult = db.query(ConsultationRequest).filter(ConsultationRequest.id == review_in.target_id).first()
        if not consult or consult.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Consultation request not found")
        if (consult.status or "").lower() != "completed":
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "NOT_ELIGIBLE",
                    "message": "Only completed consultation requests may be reviewed.",
                },
            )

    # 2. Duplicate check: 1 review per (customer, target_type, target_id) pair
    existing = db.query(Review).filter(
        Review.user_id == current_user.id,
        Review.target_type == target_type,
        Review.target_id == review_in.target_id,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"code": "REVIEW_ALREADY_EXISTS", "message": "You have already reviewed this item."},
        )

    review_text = review_in.text if review_in.text is not None else review_in.comment
    review = Review(
        user_id=current_user.id,
        target_type=target_type,
        target_id=review_in.target_id,
        product_id=product_id,
        rating=review_in.rating,
        comment=review_text,
        is_visible=True,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return {
        "data": ReviewOut.model_validate(review),
        "request_id": get_request_id(request),
    }


@router.get("/mine", summary="REVIEW-API-002: The customer's own reviews")
def get_my_reviews(
    current_user: CurrentUser,
    request: Request,
    db: Session = Depends(get_db),
):
    """List the authenticated customer's own reviews (all, including hidden)."""
    reviews = db.query(Review).filter(Review.user_id == current_user.id).order_by(Review.created_at.desc()).all()
    return {
        "data": [ReviewOut.model_validate(r) for r in reviews],
        "request_id": get_request_id(request),
    }


@router.get("/products/{product_id}", summary="REVIEW-API-005: Public product reviews alias")
def get_reviews_for_product_alias(
    product_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Alias for /products/{product_id}/reviews under reviews router."""
    from app.api.v1.catalog import get_product_reviews
    return get_product_reviews(product_id=product_id, request=request, db=db)


@router.patch("/{review_id}", summary="REVIEW-API-003: Edit a review within the permitted window")
def update_review(
    review_id: UUID,
    current_user: CurrentUser,
    request: Request,
    review_in: ReviewUpdate,
    db: Session = Depends(get_db),
):
    """Edit review rating/comment within 7 days of creation (IDOR safe: 404 for wrong user)."""
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review or review.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Review not found")

    _verify_review_window_and_visibility(review)

    if review_in.rating is not None:
        review.rating = review_in.rating
    new_text = review_in.text if review_in.text is not None else review_in.comment
    if new_text is not None:
        review.comment = new_text

    db.commit()
    db.refresh(review)
    return {
        "data": ReviewOut.model_validate(review),
        "request_id": get_request_id(request),
    }


@router.delete("/{review_id}", status_code=204, summary="REVIEW-API-004: Delete a review within the permitted window")
def delete_review(
    review_id: UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Delete review within 7 days of creation (IDOR safe: 404 for wrong user)."""
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review or review.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Review not found")

    _verify_review_window_and_visibility(review)

    db.delete(review)
    db.commit()
    return None
