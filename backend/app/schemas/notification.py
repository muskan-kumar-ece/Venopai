from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime

class NotificationOut(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    message: str
    is_read: bool
    event_type: Optional[str] = "general"
    status: Optional[str] = "pending"
    sent_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    retry_count: Optional[int] = 0
    subject: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

