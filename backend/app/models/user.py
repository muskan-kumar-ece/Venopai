from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.db.session import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, index=True)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    addresses = relationship("Address", back_populates="user", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="user")
    projects = relationship("Project", back_populates="user")

class Address(Base):
    __tablename__ = "addresses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String)
    line1 = Column(String, nullable=False)
    line2 = Column(String)
    city = Column(String, nullable=False)
    state = Column(String, nullable=False)
    postal_code = Column(String, nullable=False)
    country = Column(String, nullable=False)
    is_default_shipping = Column(Boolean, default=False)
    is_default_billing = Column(Boolean, default=False)

    user = relationship("User", back_populates="addresses")
