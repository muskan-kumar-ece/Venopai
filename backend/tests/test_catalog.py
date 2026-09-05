import uuid
import json
import pytest
from decimal import Decimal
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User, AuditEvent
from app.models.catalog import Category, Product, Inventory, InventoryReservation
from app.core.security import get_password_hash, create_access_token
from app.workers.celery_app import celery_app
from tests.test_utils import TestingSessionLocal

celery_app.conf.task_always_eager = True
celery_app.conf.task_eager_propagates = True

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_catalog_db():
    db = TestingSessionLocal()
    db.query(InventoryReservation).delete()
    db.query(Inventory).delete()
    db.query(Product).delete()
    db.query(Category).delete()
    db.query(AuditEvent).delete()
    db.commit()
    db.close()

def create_test_admin(db) -> User:
    admin = User(
        email=f"admin_{uuid.uuid4().hex[:6]}@venopai.com",
        hashed_password=get_password_hash("AdminPass123!"),
        full_name="Operations Admin",
        status="verified",
        role="SUPER_ADMIN",
        is_active=True,
        is_superuser=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin

def get_admin_headers(admin: User) -> dict:
    token = create_access_token(
        subject=str(admin.id),
        role="SUPER_ADMIN",
        is_admin=True,
        audience="admin",
    )
    return {"Authorization": f"Bearer {token}"}

def create_test_category(db, name="Components", slug=None, parent_id=None, is_active=True, position=0):
    if not slug:
        slug = f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:4]}"
    cat = Category(
        name=name,
        slug=slug,
        parent_id=parent_id,
        is_active=is_active,
        position=position,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat

def create_test_product(
    db,
    category_id,
    name="Arduino Uno R3",
    slug=None,
    price_paise=149900,
    status="active",
    stock_quantity=10,
    reserved_quantity=0,
    sku=None,
    cost_price_paise=90000,
):
    if not slug:
        slug = f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:4]}"
    prod = Product(
        category_id=category_id,
        name=name,
        slug=slug,
        sku=sku or f"SKU-{uuid.uuid4().hex[:6]}",
        price_paise=price_paise,
        cost_price_paise=cost_price_paise,
        status=status,
    )
    db.add(prod)
    db.flush()

    inv = Inventory(
        product_id=prod.id,
        stock_quantity=stock_quantity,
        reserved_quantity=reserved_quantity,
    )
    db.add(inv)
    db.commit()
    db.refresh(prod)
    return prod

# ---------------------------------------------------------------------------
# PUBLIC CATALOG TESTS (CAT-API-001 to CAT-API-004)
# ---------------------------------------------------------------------------

def test_list_products_empty():
    res = client.get("/api/v1/products")
    assert res.status_code == 200
    body = res.json()
    assert body["data"] == []
    assert body["pagination"]["total_items"] == 0
    assert "request_id" in body

def test_list_products_only_active_returned():
    db = TestingSessionLocal()
    cat = create_test_category(db)
    cat_id = cat.id
    create_test_product(db, cat_id, name="Active Product", slug="active-prod", status="active")
    create_test_product(db, cat_id, name="Draft Product", slug="draft-prod", status="draft")
    create_test_product(db, cat_id, name="Inactive Product", slug="inactive-prod", status="inactive")
    create_test_product(db, cat_id, name="Discontinued Product", slug="discontinued-prod", status="discontinued")
    db.close()

    res = client.get("/api/v1/products")
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data) == 1
    assert data[0]["name"] == "Active Product"
    assert data[0]["price"] == "1499.00"
    assert data[0]["stock_status"] == "in_stock"

def test_list_products_filter_by_category():
    db = TestingSessionLocal()
    cat1 = create_test_category(db, name="Microcontrollers", slug="microcontrollers")
    cat2 = create_test_category(db, name="Sensors", slug="sensors")
    cat1_id = cat1.id
    cat2_id = cat2.id
    create_test_product(db, cat1_id, name="Arduino Uno", slug="arduino-uno")
    create_test_product(db, cat2_id, name="DHT22 Sensor", slug="dht22-sensor")
    db.close()

    res = client.get(f"/api/v1/products?category={cat1_id}")
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data) == 1
    assert data[0]["name"] == "Arduino Uno"

def test_list_products_filter_by_price():
    db = TestingSessionLocal()
    cat = create_test_category(db)
    cat_id = cat.id
    create_test_product(db, cat_id, name="Budget Board", slug="budget-board", price_paise=50000)
    create_test_product(db, cat_id, name="Pro Board", slug="pro-board", price_paise=250000)
    db.close()

    res = client.get("/api/v1/products?min_price=1000.00&max_price=3000.00")
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data) == 1
    assert data[0]["name"] == "Pro Board"

def test_list_products_filter_by_availability():
    db = TestingSessionLocal()
    cat = create_test_category(db)
    cat_id = cat.id
    create_test_product(db, cat_id, name="In Stock Item", slug="in-stock", stock_quantity=5, reserved_quantity=0)
    create_test_product(db, cat_id, name="Out of Stock Item", slug="out-of-stock", stock_quantity=2, reserved_quantity=2)
    db.close()

    res_in = client.get("/api/v1/products?availability=in_stock")
    assert res_in.status_code == 200
    assert len(res_in.json()["data"]) == 1
    assert res_in.json()["data"][0]["name"] == "In Stock Item"

    res_out = client.get("/api/v1/products?availability=out_of_stock")
    assert res_out.status_code == 200
    assert len(res_out.json()["data"]) == 1
    assert res_out.json()["data"][0]["name"] == "Out of Stock Item"

def test_list_products_sorting():
    db = TestingSessionLocal()
    cat = create_test_category(db)
    cat_id = cat.id
    create_test_product(db, cat_id, name="Cheap", slug="cheap", price_paise=10000)
    create_test_product(db, cat_id, name="Expensive", slug="expensive", price_paise=90000)
    db.close()

    res_asc = client.get("/api/v1/products?sort=price_asc")
    assert res_asc.status_code == 200
    data_asc = res_asc.json()["data"]
    assert data_asc[0]["name"] == "Cheap"

    res_desc = client.get("/api/v1/products?sort=price_desc")
    assert res_desc.status_code == 200
    data_desc = res_desc.json()["data"]
    assert data_desc[0]["name"] == "Expensive"

def test_get_product_detail_active():
    db = TestingSessionLocal()
    cat = create_test_category(db)
    cat_id = cat.id
    prod = create_test_product(db, cat_id, name="Raspberry Pi Pico", slug="pico", price_paise=45000)
    prod_id = prod.id
    db.close()

    res = client.get(f"/api/v1/products/{prod_id}")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["name"] == "Raspberry Pi Pico"
    assert data["price"] == "450.00"
    assert "cost_price" not in data

def test_get_product_detail_draft_returns_404():
    db = TestingSessionLocal()
    cat = create_test_category(db)
    cat_id = cat.id
    prod = create_test_product(db, cat_id, name="Draft Product", slug="draft-item", status="draft")
    prod_id = prod.id
    db.close()

    res = client.get(f"/api/v1/products/{prod_id}")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "PRODUCT_NOT_FOUND"

def test_list_categories_tree():
    db = TestingSessionLocal()
    parent = create_test_category(db, name="Hardware", slug="hardware")
    sub = create_test_category(db, name="Development Boards", slug="dev-boards", parent_id=parent.id)
    hidden = create_test_category(db, name="Secret Category", slug="secret", is_active=False)
    db.close()

    res = client.get("/api/v1/categories")
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data) == 1
    assert data[0]["name"] == "Hardware"
    assert len(data[0]["children"]) == 1
    assert data[0]["children"][0]["name"] == "Development Boards"

def test_get_category_detail_with_products():
    db = TestingSessionLocal()
    cat = create_test_category(db, name="Kits", slug="kits")
    cat_id = cat.id
    create_test_product(db, cat_id, name="Starter Kit", slug="starter-kit")
    db.close()

    res = client.get(f"/api/v1/categories/{cat_id}")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["category"]["name"] == "Kits"
    assert len(data["products"]) == 1
    assert data["products"][0]["name"] == "Starter Kit"

# ---------------------------------------------------------------------------
# ADMIN CATALOG & CATEGORY TESTS
# ---------------------------------------------------------------------------

def test_admin_create_category_success():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    admin_id = admin.id
    headers = get_admin_headers(admin)
    db.close()

    res = client.post(
        "/api/v1/admin/categories",
        headers=headers,
        json={"name": "Tools", "slug": "tools-main", "position": 1},
    )
    assert res.status_code == 201
    assert res.json()["data"]["name"] == "Tools"

    # Verify audit event
    db = TestingSessionLocal()
    audit = db.query(AuditEvent).filter(AuditEvent.action == "CREATE_CATEGORY").first()
    assert audit is not None
    assert audit.user_id == admin_id
    db.close()

def test_admin_create_subcategory_max_depth_enforced():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    root = create_test_category(db, name="L1", slug="l1")
    l2 = create_test_category(db, name="L2", slug="l2", parent_id=root.id)
    l2_id = l2.id
    db.close()

    # Attempt to create L3 under L2 (exceeds max 2 levels per CAT-010)
    res = client.post(
        "/api/v1/admin/categories",
        headers=headers,
        json={"name": "L3", "slug": "l3", "parent_id": str(l2_id)},
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "MAX_NESTING_EXCEEDED"

def test_admin_create_category_duplicate_slug_rejected():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    create_test_category(db, name="Sensors", slug="sensors-dupe")
    db.close()

    res = client.post(
        "/api/v1/admin/categories",
        headers=headers,
        json={"name": "Sensors 2", "slug": "sensors-dupe"},
    )
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "SLUG_ALREADY_EXISTS"

def test_admin_create_product_starts_as_draft():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db, name="Robotics", slug="robotics")
    cat_id = cat.id
    db.close()

    payload = {
        "name": "Robotic Arm Kit",
        "slug": "robotic-arm-kit",
        "sku": "ROBO-001",
        "category_id": str(cat_id),
        "price": "4999.00",
        "cost_price": "3000.00",
        "description": "Educational robot kit",
    }
    res = client.post("/api/v1/admin/products", headers=headers, json=payload)
    assert res.status_code == 201
    prod_data = res.json()["data"]
    assert prod_data["status"] == "draft"
    assert prod_data["price"] == "4999.00"
    assert prod_data["cost_price"] == "3000.00"

    # Verify inventory was created automatically
    assert prod_data["inventory"]["stock_quantity"] == 0
    assert prod_data["inventory"]["available_quantity"] == 0

    # Public endpoint must not return this draft product
    pub_res = client.get(f"/api/v1/products/{prod_data['id']}")
    assert pub_res.status_code == 404

def test_admin_update_product_to_active():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    prod = create_test_product(db, cat.id, name="Test Device", slug="test-device", status="draft")
    prod_id = prod.id
    db.close()

    res = client.patch(
        f"/api/v1/admin/products/{prod_id}",
        headers=headers,
        json={"status": "active"},
    )
    assert res.status_code == 200
    assert res.json()["data"]["status"] == "active"

    # Now publicly accessible
    pub_res = client.get(f"/api/v1/products/{prod_id}")
    assert pub_res.status_code == 200
    assert pub_res.json()["data"]["name"] == "Test Device"

def test_admin_endpoints_require_admin_role():
    res = client.get("/api/v1/admin/products")
    assert res.status_code == 401

# ---------------------------------------------------------------------------
# ADMIN INVENTORY TESTS (ADMIN-INV-API-001 to 004)
# ---------------------------------------------------------------------------

def test_admin_get_inventory():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    prod = create_test_product(db, cat.id, stock_quantity=25, reserved_quantity=5)
    prod_id = prod.id
    db.close()

    res = client.get(f"/api/v1/admin/inventory/{prod_id}", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["stock_quantity"] == 25
    assert data["reserved_quantity"] == 5
    assert data["available_quantity"] == 20

def test_admin_adjust_inventory_positive():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    prod = create_test_product(db, cat.id, stock_quantity=10, reserved_quantity=0)
    prod_id = prod.id
    db.close()

    res = client.post(
        f"/api/v1/admin/inventory/{prod_id}/adjust",
        headers=headers,
        json={"delta": 15, "reason": "Restocked from supplier batch #45"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["stock_quantity"] == 25
    assert data["available_quantity"] == 25
    assert data["adjusted_by"] == 15

    # Audit check
    db = TestingSessionLocal()
    audit = db.query(AuditEvent).filter(AuditEvent.action == "ADJUST_INVENTORY").first()
    assert audit is not None
    details = json.loads(audit.details)
    assert details["delta"] == 15
    assert details["reason"] == "Restocked from supplier batch #45"
    db.close()

def test_admin_adjust_inventory_negative_valid():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    prod = create_test_product(db, cat.id, stock_quantity=20, reserved_quantity=2)
    prod_id = prod.id
    db.close()

    res = client.post(
        f"/api/v1/admin/inventory/{prod_id}/adjust",
        headers=headers,
        json={"delta": -5, "reason": "Damaged units written off"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["stock_quantity"] == 15
    assert data["available_quantity"] == 13

def test_admin_adjust_inventory_negative_below_zero_rejected():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    prod = create_test_product(db, cat.id, stock_quantity=5, reserved_quantity=0)
    prod_id = prod.id
    db.close()

    res = client.post(
        f"/api/v1/admin/inventory/{prod_id}/adjust",
        headers=headers,
        json={"delta": -10, "reason": "Inventory count correction"},
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "INSUFFICIENT_STOCK"

def test_admin_adjust_inventory_negative_available_rejected():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    prod = create_test_product(db, cat.id, stock_quantity=10, reserved_quantity=8)
    prod_id = prod.id
    db.close()

    res = client.post(
        f"/api/v1/admin/inventory/{prod_id}/adjust",
        headers=headers,
        json={"delta": -5, "reason": "Attempting invalid reduction"},
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "NEGATIVE_AVAILABLE_STOCK"

def test_admin_adjust_inventory_missing_reason_rejected():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    prod = create_test_product(db, cat.id, stock_quantity=10)
    prod_id = prod.id
    db.close()

    res = client.post(
        f"/api/v1/admin/inventory/{prod_id}/adjust",
        headers=headers,
        json={"delta": 5, "reason": "   "},
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "MISSING_REASON"

def test_admin_create_product_duplicate_slug_rejected():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    cat_id = str(cat.id)
    create_test_product(db, cat.id, slug="unique-slug-1")
    db.close()

    res = client.post(
        "/api/v1/admin/products",
        headers=headers,
        json={
            "name": "Another Product",
            "slug": "unique-slug-1",
            "category_id": cat_id,
            "price": "100.00",
        },
    )
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "SLUG_ALREADY_EXISTS"

def test_admin_list_inventory_all():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    create_test_product(db, cat.id, stock_quantity=12, reserved_quantity=2)
    create_test_product(db, cat.id, stock_quantity=20, reserved_quantity=5)
    db.close()

    res = client.get("/api/v1/admin/inventory", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert len(body["data"]) == 2
    assert body["pagination"]["total_items"] == 2

def test_admin_list_reservations_empty():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    prod = create_test_product(db, cat.id)
    prod_id = str(prod.id)
    db.close()

    res = client.get(f"/api/v1/admin/inventory/{prod_id}/reservations", headers=headers)
    assert res.status_code == 200
    assert res.json()["data"] == []
