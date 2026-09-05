import uuid
import json
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User, Address
from app.models.catalog import Product, Inventory, InventoryReservation
from app.models.order import Cart, CartItem, CheckoutSession
from app.core.security import get_password_hash, create_access_token
from app.services.checkout import release_expired_reservations
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_checkout_db():
    db = TestingSessionLocal()
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


def create_customer(db, email=None, status="verified"):
    user = User(
        email=email or f"customer_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=get_password_hash("Secret123!"),
        full_name="Verified Customer",
        status=status,
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


def create_product(db, name="Arduino Uno", price_paise=100000, stock=10, weight=200):
    p = Product(
        name=name,
        slug=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:4]}",
        price_paise=price_paise,
        status="active",
        weight_grams=weight,
    )
    db.add(p)
    db.flush()
    inv = Inventory(product_id=p.id, stock_quantity=stock, reserved_quantity=0)
    db.add(inv)
    db.commit()
    db.refresh(p)
    return p


def create_address(db, user, state="Telangana", pincode="500001"):
    addr = Address(
        user_id=user.id,
        recipient_name="Test Recipient",
        phone="+919812345678",
        line1="12 Street",
        city="Hyderabad",
        state=state,
        pincode=pincode,
        country="India",
        is_default=True,
    )
    db.add(addr)
    db.commit()
    db.refresh(addr)
    return addr


def add_to_cart(db, user, product, quantity):
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


def test_checkout_unauthenticated_blocked():
    res = client.post("/api/v1/checkout/sessions", json={"address_id": str(uuid.uuid4())})
    assert res.status_code == 401


def test_checkout_unverified_customer_blocked_chk_001():
    db = TestingSessionLocal()
    user = create_customer(db, status="registered") # unverified
    headers = get_auth_headers(user)
    db.close()

    res = client.post(
        "/api/v1/checkout/sessions",
        json={"address_id": str(uuid.uuid4())},
        headers=headers,
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "UNVERIFIED_ACCOUNT"


def test_checkout_empty_cart_blocked():
    db = TestingSessionLocal()
    user = create_customer(db)
    addr = create_address(db, user)
    headers = get_auth_headers(user)
    addr_id = str(addr.id)
    db.close()

    res = client.post(
        "/api/v1/checkout/sessions",
        json={"address_id": addr_id},
        headers=headers,
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "EMPTY_CART"


def test_checkout_unserviceable_address_blocked_chk_002():
    db = TestingSessionLocal()
    user = create_customer(db)
    p = create_product(db)
    add_to_cart(db, user, p, 1)
    addr = create_address(db, user, pincode="999999") # known unserviceable mock PIN
    headers = get_auth_headers(user)
    addr_id = str(addr.id)
    db.close()

    res = client.post(
        "/api/v1/checkout/sessions",
        json={"address_id": addr_id},
        headers=headers,
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "ADDRESS_UNSERVICEABLE"


def test_checkout_address_not_owned_returns_404():
    db = TestingSessionLocal()
    user_a = create_customer(db, email="alice@example.com")
    user_b = create_customer(db, email="bob@example.com")
    p = create_product(db)
    add_to_cart(db, user_a, p, 1)
    addr_b = create_address(db, user_b) # belongs to Bob
    headers_a = get_auth_headers(user_a)
    addr_b_id = str(addr_b.id)
    db.close()

    res = client.post(
        "/api/v1/checkout/sessions",
        json={"address_id": addr_b_id},
        headers=headers_a,
    )
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "ADDRESS_NOT_FOUND"


def test_critical_reservation_lifecycle_and_accounting():
    """Section 49 Critical test:
    Stock = 5, Cart quantity = 2
    Before: reserved=0, available=5
    After checkout: reserved=2, available=3, reservation=ACTIVE, order_id=NULL
    After expiry: reserved=0, available=5, reservation=EXPIRED
    """
    db = TestingSessionLocal()
    user = create_customer(db)
    p = create_product(db, name="Component A", price_paise=100000, stock=5)
    add_to_cart(db, user, p, 2)
    addr = create_address(db, user)
    headers = get_auth_headers(user)
    p_id = p.id
    addr_id = str(addr.id)
    db.close()

    # Before checkout
    db = TestingSessionLocal()
    inv = db.query(Inventory).filter(Inventory.product_id == p_id).first()
    assert inv.stock_quantity == 5
    assert inv.reserved_quantity == 0
    assert (inv.stock_quantity - inv.reserved_quantity) == 5
    db.close()

    # Checkout session creation
    res = client.post(
        "/api/v1/checkout/sessions",
        json={"address_id": addr_id},
        headers=headers,
    )
    assert res.status_code == 201
    data = res.json()["data"]
    session_id = data["checkout_session_id"]
    assert data["reservation_expires_at"] is not None

    # After checkout
    db = TestingSessionLocal()
    inv = db.query(Inventory).filter(Inventory.product_id == p_id).first()
    assert inv.stock_quantity == 5
    assert inv.reserved_quantity == 2
    assert (inv.stock_quantity - inv.reserved_quantity) == 3

    reservation = db.query(InventoryReservation).filter(
        InventoryReservation.checkout_session_id == uuid.UUID(session_id)
    ).first()
    assert reservation is not None
    assert reservation.quantity == 2
    assert reservation.status == "ACTIVE"
    assert reservation.order_id is None # CHK-004: order_id MUST be NULL
    db.close()

    # Simulate expiration by setting expires_at to 1 second ago
    db = TestingSessionLocal()
    res_obj = db.query(InventoryReservation).filter(
        InventoryReservation.checkout_session_id == uuid.UUID(session_id)
    ).first()
    res_obj.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    db.close()

    # Trigger Celery expiration logic
    db = TestingSessionLocal()
    released = release_expired_reservations(db)
    assert released == 1
    db.close()

    # Verify inventory returned to available
    db = TestingSessionLocal()
    inv = db.query(Inventory).filter(Inventory.product_id == p_id).first()
    assert inv.stock_quantity == 5
    assert inv.reserved_quantity == 0
    assert (inv.stock_quantity - inv.reserved_quantity) == 5

    res_obj = db.query(InventoryReservation).filter(
        InventoryReservation.checkout_session_id == uuid.UUID(session_id)
    ).first()
    assert res_obj.status == "EXPIRED"

    session_obj = db.query(CheckoutSession).filter(
        CheckoutSession.id == uuid.UUID(session_id)
    ).first()
    assert session_obj.status == "expired"
    db.close()


def test_critical_all_or_nothing_reservation():
    """Section 50 Critical test:
    Product A stock = 10, Product B stock = 0
    Cart: A=1, B=1
    Expected: 409 INSUFFICIENT_STOCK
    A reservation = none, B reservation = none, reserved_quantity unchanged, no checkout session
    """
    db = TestingSessionLocal()
    user = create_customer(db)
    prod_a = create_product(db, name="Product A", stock=10)
    prod_b = create_product(db, name="Product B", stock=0)
    add_to_cart(db, user, prod_a, 1)
    add_to_cart(db, user, prod_b, 1)
    addr = create_address(db, user)
    headers = get_auth_headers(user)
    pa_id = prod_a.id
    pb_id = prod_b.id
    addr_id = str(addr.id)
    db.close()

    res = client.post(
        "/api/v1/checkout/sessions",
        json={"address_id": addr_id},
        headers=headers,
    )
    assert res.status_code == 409
    err = res.json()["error"]
    assert err["code"] == "INSUFFICIENT_STOCK"

    # Assert no reservation leak
    db = TestingSessionLocal()
    inv_a = db.query(Inventory).filter(Inventory.product_id == pa_id).first()
    inv_b = db.query(Inventory).filter(Inventory.product_id == pb_id).first()
    assert inv_a.reserved_quantity == 0
    assert inv_b.reserved_quantity == 0
    assert db.query(InventoryReservation).count() == 0
    assert db.query(CheckoutSession).count() == 0
    db.close()


def test_critical_duplicate_checkout_idempotency():
    """Section 51 Critical test:
    Repeat POST /checkout/sessions returns the existing active session without duplicating reservations.
    """
    db = TestingSessionLocal()
    user = create_customer(db)
    prod = create_product(db, stock=10)
    p_id = prod.id
    add_to_cart(db, user, prod, 2)
    addr = create_address(db, user)
    headers = get_auth_headers(user)
    addr_id = str(addr.id)
    db.close()

    r1 = client.post("/api/v1/checkout/sessions", json={"address_id": addr_id}, headers=headers)
    assert r1.status_code == 201
    s1_id = r1.json()["data"]["checkout_session_id"]

    r2 = client.post("/api/v1/checkout/sessions", json={"address_id": addr_id}, headers=headers)
    assert r2.status_code == 201
    s2_id = r2.json()["data"]["checkout_session_id"]

    assert s1_id == s2_id

    # Verify reservation count didn't duplicate
    db = TestingSessionLocal()
    assert db.query(InventoryReservation).count() == 1
    inv = db.query(Inventory).filter(Inventory.product_id == p_id).first()
    assert inv.reserved_quantity == 2
    db.close()



def test_critical_authoritative_price_recalculation():
    """Section 52 Critical test:
    Product price changes between cart addition and checkout.
    Checkout MUST calculate with current catalog price.
    """
    db = TestingSessionLocal()
    user = create_customer(db)
    prod = create_product(db, name="Price Test Prod", price_paise=10000, stock=5) # ₹100.00
    add_to_cart(db, user, prod, 1)

    # Change catalog price to ₹120.00 (12000 paise)
    prod.price_paise = 12000
    db.commit()

    addr = create_address(db, user)
    headers = get_auth_headers(user)
    addr_id = str(addr.id)
    db.close()

    res = client.post("/api/v1/checkout/sessions", json={"address_id": addr_id}, headers=headers)
    assert res.status_code == 201
    data = res.json()["data"]
    # Subtotal must be 120.00, not 100.00
    assert data["subtotal"] == "120.00"
    assert data["items"][0]["unit_price"] == "120.00"


def test_tax_calculation_intra_vs_inter_state():
    """Section 53 Tax tests:
    - Intra-state (Telangana == Telangana): CGST + SGST
    - Inter-state (Karnataka != Telangana): IGST
    """
    db = TestingSessionLocal()
    user = create_customer(db)
    prod = create_product(db, price_paise=100000, stock=5) # ₹1000.00
    p_id = prod.id
    add_to_cart(db, user, prod, 1)

    # 1. Intra-state address (Telangana)
    addr_ts = create_address(db, user, state="Telangana")
    headers = get_auth_headers(user)
    addr_ts_id = str(addr_ts.id)
    db.close()

    res_ts = client.post("/api/v1/checkout/sessions", json={"address_id": addr_ts_id}, headers=headers)
    assert res_ts.status_code == 201
    tax_ts = res_ts.json()["data"]["tax"]
    assert tax_ts["type"] == "CGST+SGST"
    assert tax_ts["amount"] == "180.00" # 18% of 1000.00
    assert tax_ts["cgst_amount"] == "90.00"
    assert tax_ts["sgst_amount"] == "90.00"
    assert tax_ts["igst_amount"] is None

    # Clear session to test inter-state
    db = TestingSessionLocal()
    db.query(InventoryReservation).delete()
    db.query(CheckoutSession).delete()
    inv = db.query(Inventory).filter(Inventory.product_id == p_id).first()
    inv.reserved_quantity = 0
    addr_ka = create_address(db, user, state="Karnataka")
    addr_ka_id = str(addr_ka.id)
    db.commit()
    db.close()


    res_ka = client.post("/api/v1/checkout/sessions", json={"address_id": addr_ka_id}, headers=headers)
    assert res_ka.status_code == 201
    tax_ka = res_ka.json()["data"]["tax"]
    assert tax_ka["type"] == "IGST"
    assert tax_ka["amount"] == "180.00"
    assert tax_ka["cgst_amount"] is None
    assert tax_ka["sgst_amount"] is None
    assert tax_ka["igst_amount"] == "180.00"


def test_change_address_recalculates_without_resetting_reservation_timer():
    db = TestingSessionLocal()
    user = create_customer(db)
    prod = create_product(db, price_paise=100000, stock=5)
    add_to_cart(db, user, prod, 1)
    addr1 = create_address(db, user, state="Telangana", pincode="500001")
    addr2 = create_address(db, user, state="Karnataka", pincode="560001")
    headers = get_auth_headers(user)
    a1_id = str(addr1.id)
    a2_id = str(addr2.id)
    db.close()

    # Start checkout with addr1
    r1 = client.post("/api/v1/checkout/sessions", json={"address_id": a1_id}, headers=headers)
    s_id = r1.json()["data"]["checkout_session_id"]
    original_expiry = r1.json()["data"]["reservation_expires_at"]
    assert r1.json()["data"]["tax"]["type"] == "CGST+SGST"

    # Change address to addr2 (Karnataka)
    r2 = client.post(
        f"/api/v1/checkout/sessions/{s_id}/address",
        json={"address_id": a2_id},
        headers=headers,
    )
    assert r2.status_code == 200
    # Timer must NOT reset
    assert r2.json()["data"]["reservation_expires_at"] == original_expiry
    # Tax must update to IGST
    assert r2.json()["data"]["tax"]["type"] == "IGST"


def test_get_checkout_session_and_expired_state():
    db = TestingSessionLocal()
    user = create_customer(db)
    prod = create_product(db, price_paise=100000, stock=5)
    add_to_cart(db, user, prod, 1)
    addr = create_address(db, user)
    headers = get_auth_headers(user)
    addr_id = str(addr.id)
    db.close()

    r1 = client.post("/api/v1/checkout/sessions", json={"address_id": addr_id}, headers=headers)
    s_id = r1.json()["data"]["checkout_session_id"]

    # Active fetch
    get_res = client.get(f"/api/v1/checkout/sessions/{s_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["data"]["status"] == "open"
    assert get_res.json()["data"]["items"] is not None

    # Mark expired in DB
    db = TestingSessionLocal()
    sess = db.query(CheckoutSession).filter(CheckoutSession.id == uuid.UUID(s_id)).first()
    sess.status = "expired"
    sess.reservation_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    db.close()

    # Expired fetch: reservation-dependent fields become null
    exp_res = client.get(f"/api/v1/checkout/sessions/{s_id}", headers=headers)
    assert exp_res.status_code == 200
    assert exp_res.json()["data"]["status"] == "expired"
    assert exp_res.json()["data"]["items"] is None
    assert exp_res.json()["data"]["total"] is None


def test_checkout_session_ownership_isolation():
    db = TestingSessionLocal()
    user_a = create_customer(db, email="alice@example.com")
    user_b = create_customer(db, email="bob@example.com")
    prod = create_product(db, stock=5)
    add_to_cart(db, user_a, prod, 1)
    addr = create_address(db, user_a)
    headers_a = get_auth_headers(user_a)
    headers_b = get_auth_headers(user_b)
    addr_id = str(addr.id)
    db.close()

    r1 = client.post("/api/v1/checkout/sessions", json={"address_id": addr_id}, headers=headers_a)
    s_id = r1.json()["data"]["checkout_session_id"]

    # Bob attempts to get Alice's session -> 404
    bob_res = client.get(f"/api/v1/checkout/sessions/{s_id}", headers=headers_b)
    assert bob_res.status_code == 404
    assert bob_res.json()["error"]["code"] == "SESSION_NOT_FOUND"
