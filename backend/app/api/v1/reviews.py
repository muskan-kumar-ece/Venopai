import uuid as uuid_lib
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from uuid import UUID

from app.api.deps import get_db, CurrentUser
from app.core.exceptions import get_request_id
from app.schemas.review import ReviewCreate, ReviewUpdate, ReviewOut
from app.models.engagement import Review

router = APIRouter()


@router.post("", status_code=201, summary="REVIEW-API-001: Submit a review")
def create_review(
    current_user: CurrentUser,
    request: Request,
    review_in: ReviewCreate,
    db: Session = Depends(get_db),
):
    """Submit a review. Requires a qualifying delivered order item (eligibility enforced by service layer).
    One review per customer+product pair — duplicate returns 409."""
    # Duplicate check
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


@router.get("/me", summary="REVIEW-API-002: The customer's own reviews")
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
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

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
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db.delete(review)
    db.commit()
    return None
