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

router = APIRouter()

REVIEW_EDIT_WINDOW_DAYS = 7


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
    """Submit a review. Requires a qualifying delivered order item (REV-001).
    One review per customer+product pair — duplicate returns 409 REVIEW_ALREADY_EXISTS."""
    # 1. Eligibility Check: Customer must have a qualifying delivered order containing this product
    qualifying_delivered_item = (
        db.query(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .filter(
            Order.user_id == current_user.id,
            OrderItem.product_id == review_in.product_id,
            Order.status == "delivered",
        )
        .first()
    )
    if not qualifying_delivered_item:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "NOT_ELIGIBLE",
                "message": "Only customers with a delivered order for this product may submit a review.",
            },
        )

    # 2. Duplicate check: 1 review per (customer, product) pair
    existing = db.query(Review).filter(
        Review.user_id == current_user.id,
        Review.product_id == review_in.product_id,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"code": "REVIEW_ALREADY_EXISTS", "message": "You have already reviewed this product."},
        )

    review = Review(
        user_id=current_user.id,
        product_id=review_in.product_id,
        rating=review_in.rating,
        comment=review_in.comment,
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
@router.get("/me", summary="REVIEW-API-002: The customer's own reviews (alias)")
def get_my_reviews(
    current_user: CurrentUser,
    request: Request,
    db: Session = Depends(get_db),
):
    """List the authenticated customer's own reviews (all, including hidden)."""
    reviews = db.query(Review).filter(Review.user_id == current_user.id).all()
    return {
        "data": [ReviewOut.model_validate(r) for r in reviews],
        "request_id": get_request_id(request),
    }


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
    if review_in.comment is not None:
        review.comment = review_in.comment

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
