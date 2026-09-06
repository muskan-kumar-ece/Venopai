import uuid
import hmac
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.models.user import User, Address, AuditEvent
from app.models.catalog import Product, Inventory, InventoryReservation
from app.models.order import (
    Cart,
    CartItem,
    CheckoutSession,
    Order,
    OrderItem,
    Payment,
    ProcessedWebhookEvent,
)
from app.core.security import get_password_hash, create_access_token
from app.services.checkout import release_expired_reservations
from tests.test_utils import TestingSessionLocal
from app.workers.celery_app import celery_app

celery_app.conf.task_always_eager = True
celery_app.conf.task_eager_propagates = True

client = TestClient(app)

@pytest.fixture(autouse=True)
def mock_celery_session():
    with patch("app.workers.tasks.payment.SessionLocal", TestingSessionLocal):
        yield

@pytest.fixture(autouse=True)
def clean_concurrency_db():
    db = TestingSessionLocal()
    db.query(ProcessedWebhookEvent).delete()
    db.query(Payment).delete()
    db.query(OrderItem).delete()
    db.query(Order).delete()
    db.query(InventoryReservation).delete()
    db.query(CheckoutSession).delete()
    db.query(CartItem).delete()
    db.query(Cart).delete()
    db.query(Inventory).delete()
    db.query(Product).delete()
    db.query(Address).delete()
    db.query(AuditEvent).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def create_customer(db, email=None):
    user = User(
        email=email or f"conc_user_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=get_password_hash("Secret123!"),
        full_name="Concurrency User",
        status="verified",
        role="customer",
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_auth_headers(user: User):
    token = create_access_token(
        subject=str(user.id),
        role=user.role,
        is_admin=user.is_superuser,
        audience="customer",
    )
    return {"Authorization": f"Bearer {token}"}


def create_product(db, name="Limited Sensor", price_paise=150000, stock=1):
    p = Product(
        name=name,
        slug=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:4]}",
        price_paise=price_paise,
        status="active",
        weight_grams=150,
    )
    db.add(p)
    db.flush()
    inv = Inventory(product_id=p.id, stock_quantity=stock, reserved_quantity=0)
    db.add(inv)
    db.commit()
    db.refresh(p)
    return p


def create_address(db, user):
    addr = Address(
        user_id=user.id,
        recipient_name="Concurrency Recipient",
        phone="+919876543210",
        line1="Tech Park Road",
        city="Hyderabad",
        state="Telangana",
        pincode="500081",
        country="India",
        is_default=True,
    )
    db.add(addr)
    db.commit()
    db.refresh(addr)
    return addr


def add_to_cart(db, user, product, quantity=1):
    cart = db.query(Cart).filter(Cart.user_id == user.id).first()
    if not cart:
        cart = Cart(user_id=user.id)
        db.add(cart)
        db.commit()
        db.refresh(cart)
    item = CartItem(cart_id=cart.id, product_id=product.id, quantity=quantity)
    db.add(item)
    db.commit()
    return cart


def test_section_10_inventory_race_last_stock_unit():
    """Section 10 and 28 Concurrency Gate:
    Stock = 1. Customer A and Customer B race to checkout simultaneously.
    Expected: Exactly ONE succeeds (201), exactly ONE fails (409 INSUFFICIENT_STOCK).
    Never two successful reservations.
    Final stock_quantity=1, reserved_quantity=1, available=0.
    No negative available inventory.
    """
    db = TestingSessionLocal()
    user_a = create_customer(db, email="customer_a@example.com")
    user_b = create_customer(db, email="customer_b@example.com")
    product = create_product(db, name="Last Unit Widget", stock=1)
    p_id = product.id

    add_to_cart(db, user_a, product, quantity=1)
    add_to_cart(db, user_b, product, quantity=1)

    addr_a = create_address(db, user_a)
    addr_b = create_address(db, user_b)
    addr_a_id = str(addr_a.id)
    addr_b_id = str(addr_b.id)

    headers_a = get_auth_headers(user_a)
    headers_b = get_auth_headers(user_b)
    db.close()

    def attempt_checkout(headers, addr_id):
        local_client = TestClient(app)
        return local_client.post(
            "/api/v1/checkout/sessions",
            json={"address_id": addr_id},
            headers=headers,
        )

    # Execute concurrent checkout requests
    with ThreadPoolExecutor(max_workers=2) as executor:
        f_a = executor.submit(attempt_checkout, headers_a, addr_a_id)
        f_b = executor.submit(attempt_checkout, headers_b, addr_b_id)
        res_a = f_a.result()
        res_b = f_b.result()

    statuses = [res_a.status_code, res_b.status_code]
    assert 201 in statuses, f"Expected one 201, got {statuses}"
    assert 409 in statuses, f"Expected one 409, got {statuses}"
    assert statuses.count(201) == 1, "Exactly ONE reservation must succeed"
    assert statuses.count(409) == 1, "The competing customer must receive 409"

    # Verify inventory accounting
    db = TestingSessionLocal()
    inv = db.query(Inventory).filter(Inventory.product_id == p_id).first()
    assert inv.stock_quantity == 1
    assert inv.reserved_quantity == 1
    assert (inv.stock_quantity - inv.reserved_quantity) == 0, "Available inventory must be exactly 0"

    # Exactly 1 active reservation exists
    active_reservations = (
        db.query(InventoryReservation)
        .filter(InventoryReservation.inventory_id == inv.id, InventoryReservation.status == "ACTIVE")
        .all()
    )
    assert len(active_reservations) == 1
    res_obj = active_reservations[0]

    # Verify expiration releases stock
    res_obj.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()

    released_count = release_expired_reservations(db)
    assert released_count == 1

    db.refresh(inv)
    assert inv.stock_quantity == 1
    assert inv.reserved_quantity == 0
    assert (inv.stock_quantity - inv.reserved_quantity) == 1, "Stock must be fully restored upon expiration"
    db.close()


def test_concurrent_payment_initiation_idempotency_gate():
    """Section 22 and 28 Gate:
    Concurrent initiation on identical checkout session produces the same payment intent.
    """
    db = TestingSessionLocal()
    user = create_customer(db)
    product = create_product(db, stock=5)
    add_to_cart(db, user, product, quantity=1)
    addr = create_address(db, user)
    headers = get_auth_headers(user)
    addr_id = str(addr.id)
    db.close()

    # Create checkout session
    res = client.post("/api/v1/checkout/sessions", json={"address_id": addr_id}, headers=headers)
    assert res.status_code == 201
    session_id = res.json()["data"]["checkout_session_id"]

    def initiate_payment():
        local_client = TestClient(app)
        return local_client.post(
            "/api/v1/payments/initiate",
            json={"source_type": "checkout_session", "source_id": session_id},
            headers=headers,
        )

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(initiate_payment) for _ in range(3)]
        results = [f.result() for f in futures]

    for r in results:
        assert r.status_code in (200, 201)

    gw_order_ids = {r.json()["data"]["gateway_order_id"] for r in results}
    payment_ids = {r.json()["data"]["payment_id"] for r in results}
    assert len(gw_order_ids) == 1
    assert len(payment_ids) == 1

    db = TestingSessionLocal()
    payments = db.query(Payment).filter(Payment.checkout_session_id == uuid.UUID(session_id)).all()
    assert len(payments) == 1
    db.close()


def test_concurrent_webhook_deduplication_race_gate():
    """Section 22 and 28 Gate:
    Multiple identical webhook events arrive in parallel.
    Exactly 1 accepted, remaining marked duplicate_ignored.
    """
    webhook_secret = "test_webhook_secret_key"
    settings.RAZORPAY_WEBHOOK_SECRET = webhook_secret

    event_payload = {
        "event": "payment.captured",
        "event_id": "evt_phase11_race_888",
        "entity": "event",
        "contains": ["payment"],
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_phase11_888",
                    "order_id": "order_phase11_888",
                    "amount": 200000,
                    "status": "captured",
                }
            }
        },
    }
    raw_body = json.dumps(event_payload).encode("utf-8")
    sig = hmac.new(
        webhook_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    def send_webhook():
        local_client = TestClient(app)
        return local_client.post(
            "/api/v1/webhooks/razorpay",
            content=raw_body,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": sig,
                "X-Razorpay-Event-Id": "evt_phase11_race_888",
            },
        )

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(send_webhook) for _ in range(4)]
        results = [f.result() for f in futures]

    for r in results:
        assert r.status_code == 200

    statuses = [r.json()["status"] for r in results]
    assert statuses.count("accepted") == 1
    assert statuses.count("duplicate_ignored") == 3

    db = TestingSessionLocal()
    assert (
        db.query(ProcessedWebhookEvent)
        .filter(ProcessedWebhookEvent.event_id == "evt_phase11_race_888")
        .count()
        == 1
    )
    db.close()
