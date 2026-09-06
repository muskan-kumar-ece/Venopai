from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from uuid import UUID
from datetime import datetime


class ReviewCreate(BaseModel):
    target_type: str = "order_item"
    target_id: UUID
    rating: int = Field(ge=1, le=5)
    text: Optional[str] = None
    comment: Optional[str] = None

    @model_validator(mode="after")
    def populate_text_or_comment(self):
        if not self.text and self.comment:
            self.text = self.comment
        elif not self.comment and self.text:
            self.comment = self.text
        return self


class ReviewUpdate(BaseModel):
    rating: Optional[int] = Field(None, ge=1, le=5)
    text: Optional[str] = None
    comment: Optional[str] = None

    @model_validator(mode="after")
    def populate_text_or_comment(self):
        if not self.text and self.comment:
            self.text = self.comment
        elif not self.comment and self.text:
            self.comment = self.text
        return self


class ReviewOut(BaseModel):
    id: UUID
    user_id: UUID
    target_type: str
    target_id: UUID
    product_id: Optional[UUID] = None
    rating: int
    text: Optional[str] = None
    comment: Optional[str] = None
    is_visible: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def align_text_comment(self):
        if not self.text and self.comment:
            self.text = self.comment
        elif not self.comment and self.text:
            self.comment = self.text
        return self


class ProductReviewsResponse(BaseModel):
    data: List[ReviewOut]
    average_rating: Optional[float]
    review_count: int
    request_id: str


class AdminHideReview(BaseModel):
    reason: str

