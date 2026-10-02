import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Boolean, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base

def utcnow():
    return datetime.now(timezone.utc)

class Cart(Base):
    __tablename__ = "carts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")

class CartItem(Base):
    __tablename__ = "cart_items"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cart_id = Column(UUID(as_uuid=True), ForeignKey("carts.id"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)

    cart = relationship("Cart", back_populates="items")
    product = relationship("Product")

class CheckoutSession(Base):
    """Represents the pre-payment checkout session state (CHK-001 - CHK-004).
    Checkout Session != Order. Order is only created after confirmed payment.
    Holds calculated totals (subtotal, shipping, tax, total in paise) and reservation expiry.
    """
    __tablename__ = "checkout_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    cart_id = Column(UUID(as_uuid=True), ForeignKey("carts.id"), nullable=False)
    address_id = Column(UUID(as_uuid=True), ForeignKey("addresses.id"), nullable=False)
    status = Column(String(50), nullable=False, default="open", index=True)  # open, completed, expired, cancelled
    subtotal_paise = Column(Integer, nullable=False)
    shipping_rate_paise = Column(Integer, nullable=False, default=0)
    shipping_eta_min_days = Column(Integer, nullable=False, default=3)
    shipping_eta_max_days = Column(Integer, nullable=False, default=5)
    tax_type = Column(String(20), nullable=False)  # CGST+SGST, IGST
    tax_amount_paise = Column(Integer, nullable=False, default=0)
    cgst_amount_paise = Column(Integer, nullable=True)
    sgst_amount_paise = Column(Integer, nullable=True)
    igst_amount_paise = Column(Integer, nullable=True)
    total_paise = Column(Integer, nullable=False)
    reservation_expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User")
    cart = relationship("Cart")
    address = relationship("Address")
    payments = relationship("Payment", back_populates="checkout_session")


class Order(Base):
    """ORD-001: Order created ONLY post-payment (never before).
    ORD-002: Order status distinct from payment status.
    ORD-003: Cancellation only allowed pre-fulfillment.
    Status starts at 'paid' (Document 04 §15).
    """
    __tablename__ = "orders"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_number = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    checkout_session_id = Column(UUID(as_uuid=True), ForeignKey("checkout_sessions.id"), nullable=True)
    status = Column(String(50), default="paid", index=True)  # paid, processing, ready_to_ship, shipped, delivered, completed, cancelled
    
    # Financial snapshots (ORD snapshotting)
    subtotal_paise = Column(Integer, nullable=False, default=0)
    shipping_rate_paise = Column(Integer, nullable=False, default=0)
    tax_type = Column(String(20), nullable=False, default="GST")  # CGST+SGST | IGST
    tax_amount_paise = Column(Integer, nullable=False, default=0)
    cgst_amount_paise = Column(Integer, nullable=True)
    sgst_amount_paise = Column(Integer, nullable=True)
    igst_amount_paise = Column(Integer, nullable=True)
    total_paise = Column(Integer, nullable=False, default=0)
    total_amount = Column(Integer, nullable=False, default=0)  # for schema compatibility
    
    # Shipping & Address snapshot
    shipping_address_id = Column(UUID(as_uuid=True), ForeignKey("addresses.id"), nullable=True)
    shipping_address_snapshot = Column(Text, nullable=True)  # JSON serialized address
    
    # Timestamps
    paid_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="order")
    shipment = relationship("Shipment", back_populates="order", uselist=False)
    refunds = relationship("Refund", back_populates="order")
    checkout_session = relationship("CheckoutSession")
    shipping_address = relationship("Address")

    @property
    def payment_status(self) -> str:
        if self.payments:
            return sorted(self.payments, key=lambda p: p.created_at, reverse=True)[0].status
        return "successful" if self.status != "pending_payment" else "pending"

    @property
    def total_amount_paise(self) -> int:
        return self.total_paise or self.total_amount or 0

    @property
    def currency(self) -> str:
        return "INR"

    @property
    def tax_paise(self) -> int:
        return self.tax_amount_paise or 0

    @property
    def shipping_amount_paise(self) -> int:
        return self.shipping_rate_paise or 0



class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    product_name = Column(String(500), nullable=True)  # snapshot
    quantity = Column(Integer, nullable=False)
    price_at_time_of_order = Column(Integer, nullable=False)  # price in paise
    unit_price_paise = Column(Integer, nullable=True)  # snapshot in paise
    total_paise = Column(Integer, nullable=True)  # line total in paise

    order = relationship("Order", back_populates="items")
    product = relationship("Product")


class Payment(Base):
    """PAY-001 - PAY-005: Razorpay payment record.
    Supports CheckoutSession -> Payment, Quote -> Payment, Payment -> Order, Payment -> Refund(s).
    """
    __tablename__ = "payments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=True, index=True)
    quote_id = Column(UUID(as_uuid=True), ForeignKey("quotes.id"), nullable=True, index=True)
    checkout_session_id = Column(UUID(as_uuid=True), ForeignKey("checkout_sessions.id"), nullable=True, index=True)
    
    razorpay_order_id = Column(String(100), unique=True, index=True, nullable=True)
    razorpay_payment_id = Column(String(100), unique=True, index=True, nullable=True)
    razorpay_signature = Column(String(255), nullable=True)
    
    status = Column(String(50), default="pending", index=True)  # pending, successful, failed, refunded, partially_refunded
    amount = Column(Integer, nullable=False)  # in paise
    currency = Column(String(10), default="INR")
    
    error_code = Column(String(100), nullable=True)
    error_description = Column(Text, nullable=True)
    
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User")
    order = relationship("Order", back_populates="payments")
    quote = relationship("Quote", back_populates="payments")
    checkout_session = relationship("CheckoutSession", back_populates="payments")
    refunds = relationship("Refund", back_populates="payment")

    @property
    def source_type(self) -> str:
        if self.quote_id:
            return "quote"
        if self.order_id:
            return "order"
        if self.checkout_session_id:
            return "checkout_session"
        return "direct"

    @property
    def amount_paise(self) -> int:
        return self.amount or 0


class Refund(Base):
    __tablename__ = "refunds"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=True, index=True)
    payment_id = Column(UUID(as_uuid=True), ForeignKey("payments.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    razorpay_refund_id = Column(String(100), unique=True, index=True, nullable=True)
    amount = Column(Integer, nullable=False)  # paise
    status = Column(String(50), default="pending")  # pending, processed, failed
    reason = Column(String(500), nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    order = relationship("Order", back_populates="refunds")
    payment = relationship("Payment", back_populates="refunds")


class Shipment(Base):
    __tablename__ = "shipments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=True, unique=True)
    manufacturing_request_id = Column(UUID(as_uuid=True), ForeignKey("manufacturing_requests.id"), nullable=True, unique=True)
    shiprocket_order_id = Column(String(100), nullable=True)
    tracking_number = Column(String(100), nullable=True)
    carrier = Column(String(100), nullable=True)
    estimated_delivery = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), default="pending", index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    order = relationship("Order", back_populates="shipment")
    manufacturing_request = relationship("ManufacturingRequest", backref="shipment")


class ProcessedWebhookEvent(Base):
    """Section 10 & PAY-004: Deduplication of webhook events by provider's event ID."""
    __tablename__ = "processed_webhook_events"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(String(255), unique=True, index=True, nullable=False)
    event_type = Column(String(100), nullable=False)
    provider = Column(String(50), default="razorpay", nullable=False)
    payload = Column(Text, nullable=True)
    processed_at = Column(DateTime(timezone=True), default=utcnow)
