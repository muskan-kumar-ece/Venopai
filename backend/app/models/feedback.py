import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base

def utcnow():
    return datetime.now(timezone.utc)

class Feedback(Base):
    __tablename__ = "feedbacks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    guest_name = Column(String(150), nullable=True)
    guest_email = Column(String(255), nullable=True)
    guest_phone = Column(String(50), nullable=True)
    feedback_type = Column(String(50), nullable=False, default="general_feedback", index=True)
    priority = Column(String(20), nullable=False, default="medium", index=True)
    status = Column(String(30), nullable=False, default="open", index=True)
    subject = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    page_url = Column(String(500), nullable=True)
    browser_info = Column(String(500), nullable=True)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=True, index=True)
    service_request_type = Column(String(50), nullable=True)
    service_request_id = Column(UUID(as_uuid=True), nullable=True)
    screenshot_url = Column(String(1024), nullable=True)
    admin_notes = Column(Text, nullable=True)
    admin_response = Column(Text, nullable=True)
    resolved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", foreign_keys=[user_id])
    resolved_by_user = relationship("User", foreign_keys=[resolved_by])
    order = relationship("Order", foreign_keys=[order_id])
