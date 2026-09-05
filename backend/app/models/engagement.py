from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.db.session import Base

class Review(Base):
    __tablename__ = "reviews"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    rating = Column(Integer, nullable=False)
    comment = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    product = relationship("Product")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
