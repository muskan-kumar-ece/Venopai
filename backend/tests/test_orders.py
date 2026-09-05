import uuid
import json
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User, Address
from app.models.catalog import Product, Inventory, InventoryReservation
from app.models.order import (
    Cart,
    CartItem,
    CheckoutSession,
    Order,
    OrderItem,
    Payment,
    Refund,
    ProcessedWebhookEvent,
)
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_orders_db():
    db = TestingSessionLocal()
    db.query(ProcessedWebhookEvent).delete()
    db.query(Refund).delete()
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
    db.query(User).delete()
    db.commit()
    db.close()


def create_customer(db, email=None):
    user = User(
        email=email or f"cust_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=get_password_hash("Secret123!"),
        full_name="Order Test User",
        status="verified",
        role="customer",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_auth_headers(user):
    user_id = str(user.id) if hasattr(user, "id") else str(user)
    role = getattr(user, "role", "customer")
    is_super = getattr(user, "is_superuser", False)
    token = create_access_token(
        subject=user_id,
        role=role,
        is_admin=is_super,
        audience="admin" if is_super else "customer",
    )
    return {"Authorization": f"Bearer {token}"}


def setup_and_pay_order(db, stock=10, qty=2, price_paise=150000):
    user = create_customer(db)
    addr = Address(
        user_id=user.id,
        recipient_name="Alice Engineering",
        phone="+919876543210",
        line1="45 Tech Blvd",
        city="Hyderabad",
        state="Telangana",
        pincode="500081",
        country="IN",
        is_default=True,
    )
    db.add(addr)
    db.flush()

    prod = Product(
        name="Microcontroller Dev Kit",
        slug=f"dev-kit-{uuid.uuid4().hex[:4]}",
        price_paise=price_paise,
        status="active",
        weight_grams=400,
    )
    db.add(prod)
    db.flush()

    inv = Inventory(product_id=prod.id, stock_quantity=stock, reserved_quantity=0)
    db.add(inv)
    db.commit()

    headers = get_auth_headers(user)
    # Add to cart
    client.post("/api/v1/cart/items", json={"product_id": str(prod.id), "quantity": qty}, headers=headers)
    # Create checkout session
    chk_res = client.post("/api/v1/checkout/sessions", json={"address_id": str(addr.id)}, headers=headers)
    session_id = chk_res.json()["data"]["checkout_session_id"]
    # Initiate payment
    init_res = client.post("/api/v1/payments/initiate", json={"source_type": "checkout_session", "source_id": session_id}, headers=headers)
    payment_id = init_res.json()["data"]["payment_id"]
    gateway_order_id = init_res.json()["data"]["gateway_order_id"]
    # Confirm payment
    conf_res = client.post(
        f"/api/v1/payments/{payment_id}/confirm",
        json={
            "razorpay_payment_id": f"pay_{uuid.uuid4().hex[:8]}",
            "razorpay_order_id": gateway_order_id,
            "razorpay_signature": "mock_valid_signature",
        },
        headers=headers,
    )
    order_data = conf_res.json()["data"]
    return user, prod, inv, order_data


def test_no_order_exists_prior_to_verified_payment_ord_001():
    """ORD-001: Orders must never exist before verified payment."""
    db = TestingSessionLocal()
    user = create_customer(db)
    addr = Address(
        user_id=user.id,
        recipient_name="Alice Prepay",
        phone="+919876543210",
        line1="123 Street",
        city="Hyderabad",
        state="Telangana",
        pincode="500081",
        country="IN",
    )
    db.add(addr)
    prod = Product(name="Test Part", slug=f"part-{uuid.uuid4().hex[:4]}", price_paise=100000, status="active")
    db.add(prod)
    db.flush()
    inv = Inventory(product_id=prod.id, stock_quantity=10)
    db.add(inv)
    db.commit()

    headers = get_auth_headers(user)
    client.post("/api/v1/cart/items", json={"product_id": str(prod.id), "quantity": 1}, headers=headers)
    chk = client.post("/api/v1/checkout/sessions", json={"address_id": str(addr.id)}, headers=headers)
    session_id = chk.json()["data"]["checkout_session_id"]
    client.post("/api/v1/payments/initiate", json={"source_type": "checkout_session", "source_id": session_id}, headers=headers)

    # Prior to confirmation, zero orders exist
    assert db.query(Order).count() == 0
    db.close()


def test_order_creation_snapshot_fidelity():
    db = TestingSessionLocal()
    user, prod, inv, order_data = setup_and_pay_order(db, stock=10, qty=2, price_paise=150000)

    order_id = uuid.UUID(order_data["order_id"])
    order = db.query(Order).filter(Order.id == order_id).first()

    assert order is not None
    assert order.status == "paid"
    assert order.order_number.startswith("VENOPAI-")
    assert order.paid_at is not None
    assert order.user_id == user.id

    # Address snapshot verification
    snapshot = order.shipping_address_snapshot
    if isinstance(snapshot, str):
        snapshot = json.loads(snapshot)
    assert snapshot is not None
    assert snapshot["recipient_name"] == "Alice Engineering"
    assert snapshot["city"] == "Hyderabad"
    assert snapshot["state"] == "Telangana"

    # Items snapshot verification
    assert len(order.items) == 1
    item = order.items[0]
    assert item.product_id == prod.id
    assert item.product_name == prod.name
    assert item.quantity == 2
    assert item.unit_price_paise == 150000
    assert item.total_paise == 300000
    db.close()


def test_customer_list_orders_order_api_001():
    db = TestingSessionLocal()
    user1, _, _, order_data1 = setup_and_pay_order(db)
    user2 = create_customer(db, email="other_customer@example.com")
    headers1 = get_auth_headers(user1)
    headers2 = get_auth_headers(user2)
    db.close()

    # User 1 should see their order
    res1 = client.get("/api/v1/orders", headers=headers1)
    assert res1.status_code == 200
    data1 = res1.json()
    assert len(data1["data"]) == 1
    assert data1["data"][0]["order_number"] == order_data1["order_number"]
    assert data1["pagination"]["total"] == 1

    # User 2 has placed no orders
    res2 = client.get("/api/v1/orders", headers=headers2)
    assert res2.status_code == 200
    data2 = res2.json()
    assert len(data2["data"]) == 0
    assert data2["pagination"]["total"] == 0


def test_customer_get_order_detail_and_idor_protection():
    db = TestingSessionLocal()
    user1, _, _, order_data = setup_and_pay_order(db)
    user2 = create_customer(db, email="spy@example.com")
    headers1 = get_auth_headers(user1)
    headers2 = get_auth_headers(user2)
    db.close()

    order_id = order_data["order_id"]

    # Owner accesses detail
    res_owner = client.get(f"/api/v1/orders/{order_id}", headers=headers1)
    assert res_owner.status_code == 200
    assert res_owner.json()["data"]["id"] == order_id
    assert len(res_owner.json()["data"]["items"]) == 1

    # Non-owner receives 404 (IDOR protection)
    res_other = client.get(f"/api/v1/orders/{order_id}", headers=headers2)
    assert res_other.status_code == 404


def test_customer_cancel_order_pre_fulfillment_order_api_003():
    db = TestingSessionLocal()
    # 10 initial stock, order for 2 leaves 8 in stock
    user, prod, inv, order_data = setup_and_pay_order(db, stock=10, qty=2)
    order_id = order_data["order_id"]

    # Verify inventory was decremented to 8
    inv_mid = db.query(Inventory).filter(Inventory.product_id == prod.id).first()
    assert inv_mid.stock_quantity == 8
    db.close()

    headers = get_auth_headers(user)

    # Cancel the order
    cancel_res = client.post(
        f"/api/v1/orders/{order_id}/cancel",
        json={"reason": "Customer ordered incorrect specification"},
        headers=headers,
    )
    assert cancel_res.status_code == 200
    cancel_data = cancel_res.json()["data"]
    assert cancel_data["status"] == "cancelled"

    # Verify order in DB
    db = TestingSessionLocal()
    cancelled_order = db.query(Order).filter(Order.id == uuid.UUID(order_id)).first()
    assert cancelled_order.status == "cancelled"

    # Verify inventory is NOT automatically restocked (Doc 01 §21, Doc 02 §12, ORD-003)
    # Stock remains decremented at 8; cancellation triggers the refund workflow for Finance.
    inv_after = db.query(Inventory).filter(Inventory.product_id == prod.id).first()
    assert inv_after.stock_quantity == 8

    # Attempting to cancel an already cancelled order should return 409 Conflict
    cancel_again = client.post(
        f"/api/v1/orders/{order_id}/cancel",
        json={"reason": "Double cancel attempt"},
        headers=headers,
    )
    assert cancel_again.status_code == 409
    db.close()


def test_customer_get_order_invoice_order_api_004():
    """ORDER-API-004: Customer can download/view order invoice with TAX-004 breakdown, IDOR protected."""
    db = TestingSessionLocal()
    user1, prod, inv, order_data = setup_and_pay_order(db)
    user2 = create_customer(db, email="intruder_invoice@example.com")
    headers1 = get_auth_headers(user1)
    headers2 = get_auth_headers(user2)
    db.close()

    order_id = order_data["order_id"]

    # 1. Owner gets invoice
    res_inv = client.get(f"/api/v1/orders/{order_id}/invoice", headers=headers1)
    assert res_inv.status_code == 200
    inv_data = res_inv.json()["data"]
    assert inv_data["order_id"] == order_id
    assert inv_data["invoice_number"].startswith("INV-")
    assert "/invoice/download?token=" in inv_data["invoice_url"]
    assert "tax_breakdown" in inv_data
    assert len(inv_data["items"]) >= 1
    assert "expires_at" in inv_data

    # 2. Non-owner receives 404 (IDOR protection per SEC-009)
    res_other = client.get(f"/api/v1/orders/{order_id}/invoice", headers=headers2)
    assert res_other.status_code == 404

    # 3. Unauthenticated receives 401
    assert client.get(f"/api/v1/orders/{order_id}/invoice").status_code == 401


def test_order_endpoints_unauthenticated_blocked():
    assert client.get("/api/v1/orders").status_code == 401
    assert client.get(f"/api/v1/orders/{uuid.uuid4()}").status_code == 401
    assert client.post(f"/api/v1/orders/{uuid.uuid4()}/cancel", json={"reason": "test"}).status_code == 401
    assert client.get(f"/api/v1/orders/{uuid.uuid4()}/invoice").status_code == 401
