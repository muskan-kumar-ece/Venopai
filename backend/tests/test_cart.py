import uuid
import json
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User
from app.models.catalog import Product, Inventory, InventoryReservation
from app.models.order import Cart, CartItem
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_cart_db():
    db = TestingSessionLocal()
    db.query(CartItem).delete()
    db.query(Cart).delete()
    db.query(InventoryReservation).delete()
    db.query(Inventory).delete()
    db.query(Product).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def create_customer(db, email=None):
    user = User(
        email=email or f"user_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=get_password_hash("Secret123!"),
        full_name="Test Customer",
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
    token = create_access_token(subject=str(user.id), role=user.role, is_admin=user.is_superuser, audience="customer")
    return {"Authorization": f"Bearer {token}"}



def create_product(db, name="Arduino Uno", price_paise=149900, stock=10):
    p = Product(
        name=name,
        slug=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:4]}",
        description="A great board",
        price_paise=price_paise,
        status="active",
        images=json.dumps(["https://res.cloudinary.com/demo/image/upload/sample.jpg"]),
    )
    db.add(p)
    db.flush()
    inv = Inventory(product_id=p.id, stock_quantity=stock, reserved_quantity=0)
    db.add(inv)
    db.commit()
    db.refresh(p)
    return p


def test_cart_requires_authentication():
    res = client.get("/api/v1/cart")
    assert res.status_code == 401


def test_get_cart_creates_empty_cart_cart_003():
    db = TestingSessionLocal()
    user = create_customer(db)
    headers = get_auth_headers(user)
    db.close()

    res = client.get("/api/v1/cart", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["items"] == []
    assert data["subtotal"] == "0.00"
    assert data["currency"] == "INR"


def test_add_item_to_cart_success():
    db = TestingSessionLocal()
    user = create_customer(db)
    prod = create_product(db, name="Arduino Uno R3", price_paise=149900, stock=10)
    headers = get_auth_headers(user)
    db.close()

    payload = {"product_id": str(prod.id), "quantity": 2}
    res = client.post("/api/v1/cart/items", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["name"] == "Arduino Uno R3"
    assert item["quantity"] == 2
    assert item["unit_price"] == "1499.00"
    assert item["line_total"] == "2998.00"
    assert data["subtotal"] == "2998.00"
    assert item["stock_warning"] is False


def test_add_item_cart_001_never_reserves_inventory():
    """CART-001: Adding a product to the cart does NOT reserve inventory."""
    db = TestingSessionLocal()
    user = create_customer(db)
    prod = create_product(db, name="Arduino Mega", price_paise=299900, stock=5)
    headers = get_auth_headers(user)
    db.close()

    # Verify initial inventory
    db = TestingSessionLocal()
    inv = db.query(Inventory).filter(Inventory.product_id == prod.id).first()
    assert inv.reserved_quantity == 0
    assert db.query(InventoryReservation).count() == 0
    db.close()

    payload = {"product_id": str(prod.id), "quantity": 3}
    res = client.post("/api/v1/cart/items", json=payload, headers=headers)
    assert res.status_code == 200

    # Assert CART-001 invariant holds: zero reservations created, reserved_quantity unchanged
    db = TestingSessionLocal()
    inv = db.query(Inventory).filter(Inventory.product_id == prod.id).first()
    assert inv.stock_quantity == 5
    assert inv.reserved_quantity == 0
    assert db.query(InventoryReservation).count() == 0
    db.close()


def test_add_item_calling_twice_increments_quantity():
    db = TestingSessionLocal()
    user = create_customer(db)
    prod = create_product(db, name="Raspberry Pi Pico", price_paise=45000, stock=20)
    headers = get_auth_headers(user)
    db.close()

    payload = {"product_id": str(prod.id), "quantity": 1}
    client.post("/api/v1/cart/items", json=payload, headers=headers)
    res = client.post("/api/v1/cart/items", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data["items"]) == 1
    assert data["items"][0]["quantity"] == 2
    assert data["items"][0]["line_total"] == "900.00"
    assert data["subtotal"] == "900.00"


def test_add_item_cart_002_soft_stock_warning():
    """CART-002: Soft check flags stock_warning: true without blocking cart."""
    db = TestingSessionLocal()
    user = create_customer(db)
    prod = create_product(db, name="Rare Sensor", price_paise=80000, stock=2)
    headers = get_auth_headers(user)
    db.close()

    payload = {"product_id": str(prod.id), "quantity": 5}
    res = client.post("/api/v1/cart/items", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    item = data["items"][0]
    assert item["stock_warning"] is True
    assert item["quantity"] == 5


def test_add_item_inactive_or_draft_returns_404():
    db = TestingSessionLocal()
    user = create_customer(db)
    prod = Product(
        name="Draft Product",
        slug="draft-prod",
        price_paise=50000,
        status="draft",
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)
    prod_id_str = str(prod.id)
    headers = get_auth_headers(user)
    db.close()

    payload = {"product_id": prod_id_str, "quantity": 1}

    res = client.post("/api/v1/cart/items", json=payload, headers=headers)
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "PRODUCT_NOT_FOUND"


def test_update_cart_item_quantity():
    db = TestingSessionLocal()
    user = create_customer(db)
    prod = create_product(db, name="Motor Shield", price_paise=60000, stock=10)
    headers = get_auth_headers(user)
    db.close()

    add_res = client.post(
        "/api/v1/cart/items",
        json={"product_id": str(prod.id), "quantity": 1},
        headers=headers,
    )
    item_id = add_res.json()["data"]["items"][0]["id"]

    res = client.patch(
        f"/api/v1/cart/items/{item_id}",
        json={"quantity": 4},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["items"][0]["quantity"] == 4
    assert data["items"][0]["line_total"] == "2400.00"
    assert data["subtotal"] == "2400.00"


def test_update_cart_item_invalid_quantity():
    db = TestingSessionLocal()
    user = create_customer(db)
    prod = create_product(db, name="OLED Display", price_paise=40000, stock=10)
    headers = get_auth_headers(user)
    db.close()

    add_res = client.post(
        "/api/v1/cart/items",
        json={"product_id": str(prod.id), "quantity": 1},
        headers=headers,
    )
    item_id = add_res.json()["data"]["items"][0]["id"]

    res = client.patch(
        f"/api/v1/cart/items/{item_id}",
        json={"quantity": 0},
        headers=headers,
    )
    assert res.status_code == 422  # Pydantic ge=1 validation error


def test_delete_cart_item():
    db = TestingSessionLocal()
    user = create_customer(db)
    prod = create_product(db, name="Jumper Wires", price_paise=15000, stock=50)
    headers = get_auth_headers(user)
    db.close()

    add_res = client.post(
        "/api/v1/cart/items",
        json={"product_id": str(prod.id), "quantity": 2},
        headers=headers,
    )
    item_id = add_res.json()["data"]["items"][0]["id"]

    del_res = client.delete(f"/api/v1/cart/items/{item_id}", headers=headers)
    assert del_res.status_code == 200
    data = del_res.json()["data"]
    assert data["items"] == []
    assert data["subtotal"] == "0.00"


def test_clear_cart():
    db = TestingSessionLocal()
    user = create_customer(db)
    prod1 = create_product(db, name="Item 1", price_paise=10000, stock=10)
    prod2 = create_product(db, name="Item 2", price_paise=20000, stock=10)
    p1_id = str(prod1.id)
    p2_id = str(prod2.id)
    headers = get_auth_headers(user)
    db.close()

    client.post("/api/v1/cart/items", json={"product_id": p1_id, "quantity": 1}, headers=headers)
    client.post("/api/v1/cart/items", json={"product_id": p2_id, "quantity": 2}, headers=headers)


    clear_res = client.delete("/api/v1/cart", headers=headers)
    assert clear_res.status_code == 200
    data = clear_res.json()["data"]
    assert data["items"] == []
    assert data["subtotal"] == "0.00"


def test_customer_ownership_isolation():
    """Customer A cannot view or tamper with Customer B's cart."""
    db = TestingSessionLocal()
    user_a = create_customer(db, email="alice@example.com")
    user_b = create_customer(db, email="bob@example.com")
    prod = create_product(db, name="Shared Part", price_paise=50000, stock=10)
    headers_a = get_auth_headers(user_a)
    headers_b = get_auth_headers(user_b)
    db.close()

    # User A adds item
    res_a = client.post("/api/v1/cart/items", json={"product_id": str(prod.id), "quantity": 3}, headers=headers_a)
    item_a_id = res_a.json()["data"]["items"][0]["id"]

    # User B checks their cart - must be empty
    res_b = client.get("/api/v1/cart", headers=headers_b)
    assert res_b.json()["data"]["items"] == []

    # User B attempts to delete User A's item - must return 404
    hack_res = client.delete(f"/api/v1/cart/items/{item_a_id}", headers=headers_b)
    assert hack_res.status_code == 404

    # User B attempts to patch User A's item - must return 404
    hack_patch = client.patch(f"/api/v1/cart/items/{item_a_id}", json={"quantity": 10}, headers=headers_b)
    assert hack_patch.status_code == 404
