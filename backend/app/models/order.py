from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.db.session import Base

class Cart(Base):
    __tablename__ = "carts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")

class CartItem(Base):
    __tablename__ = "cart_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cart_id = Column(UUID(as_uuid=True), ForeignKey("carts.id"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)

    cart = relationship("Cart", back_populates="items")
    product = relationship("Product")

class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(String, default="PENDING", index=True)
    total_amount = Column(Integer, nullable=False) # In cents
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    payment = relationship("Payment", back_populates="order", uselist=False)
    shipment = relationship("Shipment", back_populates="order", uselist=False)

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    price_at_time_of_order = Column(Integer, nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product")

class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, unique=True)
    razorpay_order_id = Column(String, unique=True)
    razorpay_payment_id = Column(String, unique=True)
    status = Column(String, default="PENDING")
    amount = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    order = relationship("Order", back_populates="payment")

class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, unique=True)
    shiprocket_order_id = Column(String)
    tracking_number = Column(String)
    status = Column(String, default="PENDING")
    created_at = Column(DateTime, default=datetime.utcnow)

    order = relationship("Order", back_populates="shipment")
