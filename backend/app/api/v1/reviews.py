from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from uuid import UUID

from app.api.deps import get_db, CurrentUser
from app.core.exceptions import get_request_id
from app.schemas.review import ReviewCreate, ReviewUpdate, ReviewOut
from app.models.engagement import Review

router = APIRouter()

@router.post("", status_code=201)
def create_review(
    current_user: CurrentUser,
    request: Request,
    review_in: ReviewCreate,
    db: Session = Depends(get_db)
):
    review = Review(
        user_id=current_user.id,
        product_id=review_in.product_id,
        rating=review_in.rating,
        comment=review_in.comment
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return {
        "data": ReviewOut.model_validate(review),
        "request_id": get_request_id(request)
    }

@router.get("/product/{product_id}")
def get_product_reviews(product_id: UUID, request: Request, db: Session = Depends(get_db)):
    reviews = db.query(Review).filter(Review.product_id == product_id).all()
    return {
        "data": [ReviewOut.model_validate(r) for r in reviews],
        "request_id": get_request_id(request)
    }

@router.get("/me")
def get_my_reviews(current_user: CurrentUser, request: Request, db: Session = Depends(get_db)):
    reviews = db.query(Review).filter(Review.user_id == current_user.id).all()
    return {
        "data": [ReviewOut.model_validate(r) for r in reviews],
        "request_id": get_request_id(request)
    }

@router.patch("/{review_id}")
def update_review(
    review_id: UUID,
    current_user: CurrentUser,
    request: Request,
    review_in: ReviewUpdate,
    db: Session = Depends(get_db)
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
        "request_id": get_request_id(request)
    }

@router.delete("/{review_id}", status_code=204)
def delete_review(
    review_id: UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db.delete(review)
    db.commit()
    return None
