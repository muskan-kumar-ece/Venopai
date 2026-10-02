import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Boolean, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base

def utcnow():
    return datetime.now(timezone.utc)

class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("user_id", "target_type", "target_id", name="uq_reviews_user_target"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    target_type = Column(String(50), nullable=False, default="order_item", index=True)
    target_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=True, index=True)
    rating = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)
    is_visible = Column(Boolean, default=True, nullable=False)
    moderation_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User")
    product = relationship("Product")

    @property
    def text(self) -> str | None:
        return self.comment

    @text.setter
    def text(self, val: str | None):
        self.comment = val

    @property
    def is_hidden(self) -> bool:
        return not self.is_visible

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    event_type = Column(String(100), nullable=False, default="general", index=True)
    status = Column(String(50), nullable=False, default="pending", index=True)  # pending, sent, failed
    failure_reason = Column(Text, nullable=True)
    retry_count = Column(Integer, nullable=False, default=0)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    idempotency_key = Column(String(255), unique=True, index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User")

    @property
    def subject(self) -> str:
        return self.title

    @subject.setter
    def subject(self, val: str):
        self.title = val

    @property
    def delivery_status(self) -> str:
        return self.status
