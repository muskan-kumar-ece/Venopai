from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime

class ReviewCreate(BaseModel):
    product_id: UUID
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None

class ReviewUpdate(BaseModel):
    rating: Optional[int] = Field(None, ge=1, le=5)
    comment: Optional[str] = None

class ReviewOut(BaseModel):
    id: UUID
    user_id: UUID
    product_id: UUID
    rating: int
    comment: Optional[str]
    created_at: datetime
    
    model_config = {"from_attributes": True}
