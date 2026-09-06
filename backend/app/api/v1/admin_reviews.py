from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from uuid import UUID

from app.api.deps import get_db, CurrentAdmin
from app.core.exceptions import get_request_id
from app.schemas.review import ReviewOut
from app.models.engagement import Review

router = APIRouter()

@router.get("")
def get_all_reviews(admin: CurrentAdmin, request: Request, db: Session = Depends(get_db)):
    reviews = db.query(Review).all()
    return {
        "data": [ReviewOut.model_validate(r) for r in reviews],
        "request_id": get_request_id(request)
    }

@router.get("/{review_id}")
def get_review_detail(review_id: UUID, admin: CurrentAdmin, request: Request, db: Session = Depends(get_db)):
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    return {
        "data": ReviewOut.model_validate(review),
        "request_id": get_request_id(request)
    }

@router.delete("/{review_id}", status_code=204)
def admin_delete_review(review_id: UUID, admin: CurrentAdmin, db: Session = Depends(get_db)):
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    db.delete(review)
    db.commit()
    return None
