import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, DateTime, ForeignKey, Boolean, Text, CheckConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base

def utcnow():
    return datetime.now(timezone.utc)

class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String(1024), nullable=True)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    parent = relationship("Category", back_populates="children", remote_side="Category.id")
    children = relationship("Category", back_populates="parent")
    products = relationship("Product", back_populates="category")

class Product(Base):
    """CAT-001: only active products visible to customers.
    CAT-002: price_paise is authoritative price at time of cart/checkout.
    CAT-003: out-of-stock products remain visible but not purchasable.
    """
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False)
    name = Column(String(500), nullable=False, index=True)
    slug = Column(String(500), unique=True, index=True, nullable=False)
    sku = Column(String(100), unique=True, nullable=True, index=True)
    description = Column(Text, nullable=True)
    price_paise = Column(Integer, nullable=False)
    compare_price_paise = Column(Integer, nullable=True)
    cost_price_paise = Column(Integer, nullable=True)
    status = Column(String(50), nullable=False, default="draft", index=True)
    is_featured = Column(Boolean, nullable=False, default=False)
    images = Column(Text, nullable=True)
    specifications = Column(Text, nullable=True)
    weight_grams = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        CheckConstraint("price_paise >= 0", name="chk_product_price_paise_non_negative"),
        CheckConstraint(
            "compare_price_paise IS NULL OR compare_price_paise >= 0",
            name="chk_product_compare_price_paise_non_negative"
        ),
        CheckConstraint(
            "cost_price_paise IS NULL OR cost_price_paise >= 0",
            name="chk_product_cost_price_paise_non_negative"
        ),
        CheckConstraint(
            "status IN ('draft', 'active', 'inactive', 'discontinued')",
            name="chk_product_status_valid"
        ),
    )

    category = relationship("Category", back_populates="products")
    inventory = relationship("Inventory", back_populates="product", uselist=False)

class Inventory(Base):
    """INV-001: tracks stock and reserved quantities.
    INV-006: two simultaneous reservations must not oversell.
    Optimistic concurrency control via version column.
    """
    __tablename__ = "inventory"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), unique=True, nullable=False)
    stock_quantity = Column(Integer, nullable=False, default=0)
    reserved_quantity = Column(Integer, nullable=False, default=0)
    reorder_point = Column(Integer, nullable=False, default=0)
    version = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        CheckConstraint("stock_quantity >= 0", name="chk_inventory_stock_non_negative"),
        CheckConstraint("reserved_quantity >= 0", name="chk_inventory_reserved_non_negative"),
        CheckConstraint(
            "reserved_quantity <= stock_quantity",
            name="chk_inventory_reserved_le_stock"
        ),
    )

    product = relationship("Product", back_populates="inventory")
    reservations = relationship("InventoryReservation", back_populates="inventory")

class InventoryReservation(Base):
    """INV-002: created at checkout entry.
    INV-003: expires after ~15 minutes.
    """
    __tablename__ = "inventory_reservations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inventory_id = Column(UUID(as_uuid=True), ForeignKey("inventory.id"), nullable=False)
    order_id = Column(UUID(as_uuid=True), nullable=True)
    quantity = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    released_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_inventory_reservation_quantity_positive"),
        CheckConstraint(
            "status IN ('ACTIVE', 'RELEASED', 'CONSUMED', 'EXPIRED')",
            name="chk_inventory_reservation_status_valid"
        ),
        Index("ix_inventory_reservations_inventory_id", "inventory_id"),
        Index("ix_inventory_reservations_status", "status"),
    )

    inventory = relationship("Inventory", back_populates="reservations")
