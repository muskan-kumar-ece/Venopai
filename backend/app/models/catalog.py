from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.db.session import Base

class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)

    products = relationship("Product", back_populates="category")

class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False)
    name = Column(String, index=True, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    description = Column(String)
    price = Column(Integer, nullable=False) # Store in cents/paise
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("Category", back_populates="products")
    inventory = relationship("Inventory", back_populates="product", uselist=False)

class Inventory(Base):
    __tablename__ = "inventory"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), unique=True, nullable=False)
    stock = Column(Integer, default=0, nullable=False)
    reserved = Column(Integer, default=0, nullable=False)

    product = relationship("Product", back_populates="inventory")
