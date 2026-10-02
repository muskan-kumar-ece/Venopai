from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime

class FeedbackCreate(BaseModel):
    feedback_type: str = Field(default="general_feedback")
    subject: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=5)
    guest_name: Optional[str] = None
    guest_email: Optional[str] = None
    guest_phone: Optional[str] = None
    page_url: Optional[str] = None
    browser_info: Optional[str] = None
    order_id: Optional[str] = None
    service_request_type: Optional[str] = None
    service_request_id: Optional[str] = None
    screenshot_url: Optional[str] = None
    priority: Optional[str] = None

class FeedbackAdminUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    admin_notes: Optional[str] = None
    admin_response: Optional[str] = None
