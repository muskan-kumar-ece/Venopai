import uuid
import json
import pytest
from unittest.mock import patch
from decimal import Decimal
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User, AuditEvent
from app.models.catalog import Category, Product, Inventory, InventoryReservation, ProductCategory
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
    db.query(ProductCategory).delete()
    db.query(Product).delete()
    db.query(Category).delete()
    db.query(AuditEvent).delete()
    db.commit()
    db.close()

def create_test_admin(db, role="SUPER_ADMIN") -> User:
    admin = User(
        email=f"admin_{uuid.uuid4().hex[:6]}@venopai.com",
        hashed_password=get_password_hash("AdminPass123!"),
        full_name="Operations Admin",
        status="verified",
        role=role,
        is_active=True,
        is_superuser=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin

def create_test_customer(db) -> User:
    customer = User(
        email=f"customer_{uuid.uuid4().hex[:6]}@venopai.com",
        hashed_password=get_password_hash("CustomerPass123!"),
        full_name="Standard Customer",
        status="verified",
        role="customer",
        is_active=True,
        is_superuser=False,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer

def get_admin_headers(admin: User) -> dict:
    token = create_access_token(
        subject=str(admin.id),
        role=admin.role,
        is_admin=True,
        audience="admin",
    )
    return {"Authorization": f"Bearer {token}"}

def get_customer_headers(customer: User) -> dict:
    token = create_access_token(
        subject=str(customer.id),
        role="customer",
        is_admin=False,
        audience="customer",
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
    category_ids=None,
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
        name=name,
        slug=slug,
        sku=sku or f"SKU-{uuid.uuid4().hex[:6]}",
        price_paise=price_paise,
        cost_price_paise=cost_price_paise,
        status=status,
    )
    if category_ids:
        categories = db.query(Category).filter(Category.id.in_(category_ids)).all()
        prod.categories = categories

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
    cat_ids = [cat.id]
    create_test_product(db, cat_ids, name="Active Product", slug="active-prod", status="active")
    create_test_product(db, cat_ids, name="Draft Product", slug="draft-prod", status="draft")
    create_test_product(db, cat_ids, name="Inactive Product", slug="inactive-prod", status="inactive")
    create_test_product(db, cat_ids, name="Discontinued Product", slug="discontinued-prod", status="discontinued")
    db.close()

    res = client.get("/api/v1/products")
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data) == 1
    assert data[0]["name"] == "Active Product"
    assert data[0]["price"] == "1499.00"
    assert data[0]["stock_status"] == "in_stock"
    assert len(data[0]["category_ids"]) == 1

def test_list_products_filter_by_price():
    db = TestingSessionLocal()
    cat = create_test_category(db)
    create_test_product(db, [cat.id], name="Budget Board", slug="budget-board", price_paise=50000)
    create_test_product(db, [cat.id], name="Pro Board", slug="pro-board", price_paise=250000)
    db.close()

    res = client.get("/api/v1/products?min_price=1000.00&max_price=3000.00")
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data) == 1
    assert data[0]["name"] == "Pro Board"

def test_list_products_filter_by_availability():
    db = TestingSessionLocal()
    cat = create_test_category(db)
    create_test_product(db, [cat.id], name="In Stock Item", slug="in-stock", stock_quantity=5, reserved_quantity=0)
    create_test_product(db, [cat.id], name="Out of Stock Item", slug="out-of-stock", stock_quantity=2, reserved_quantity=2)
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
    create_test_product(db, [cat.id], name="Cheap", slug="cheap", price_paise=10000)
    create_test_product(db, [cat.id], name="Expensive", slug="expensive", price_paise=90000)
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
    prod = create_test_product(db, [cat.id], name="Raspberry Pi Pico", slug="pico", price_paise=45000)
    prod_id = prod.id
    db.close()

    res = client.get(f"/api/v1/products/{prod_id}")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["name"] == "Raspberry Pi Pico"
    assert data["price"] == "450.00"
    assert "cost_price" not in data
    assert len(data["category_ids"]) == 1

def test_get_product_detail_draft_returns_404():
    db = TestingSessionLocal()
    cat = create_test_category(db)
    prod = create_test_product(db, [cat.id], name="Draft Product", slug="draft-item", status="draft")
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
    create_test_product(db, [cat.id], name="Starter Kit", slug="starter-kit")
    db.close()

    res = client.get(f"/api/v1/categories/{cat_id}")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["category"]["name"] == "Kits"
    assert len(data["products"]) == 1
    assert data["products"][0]["name"] == "Starter Kit"

# ---------------------------------------------------------------------------
# M:N PRODUCT & CATEGORY TESTS (CORRECTION #2)
# ---------------------------------------------------------------------------

def test_product_can_have_multiple_categories():
    db = TestingSessionLocal()
    cat1 = create_test_category(db, name="Components", slug="components-mn")
    cat2 = create_test_category(db, name="Robotics", slug="robotics-mn")
    cat1_id = str(cat1.id)
    cat2_id = str(cat2.id)
    prod = create_test_product(db, [cat1.id, cat2.id], name="Servo Motor", slug="servo-motor")
    prod_id = prod.id
    db.close()

    res = client.get(f"/api/v1/products/{prod_id}")
    assert res.status_code == 200
    cat_ids = res.json()["data"]["category_ids"]
    assert len(cat_ids) == 2
    assert cat1_id in cat_ids
    assert cat2_id in cat_ids

def test_category_contains_multiple_products():
    db = TestingSessionLocal()
    cat = create_test_category(db, name="Sensors", slug="sensors-multi")
    cat_id = cat.id
    create_test_product(db, [cat.id], name="Temp Sensor", slug="temp-sensor")
    create_test_product(db, [cat.id], name="Humidity Sensor", slug="humidity-sensor")
    db.close()

    res = client.get(f"/api/v1/categories/{cat_id}")
    assert res.status_code == 200
    prods = res.json()["data"]["products"]
    assert len(prods) == 2

def test_duplicate_category_assignment_rejected():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db, name="Testing", slug="testing-cat")
    cat_id = str(cat.id)
    db.close()

    res = client.post(
        "/api/v1/admin/products",
        headers=headers,
        json={
            "name": "Dupe Cat Product",
            "slug": "dupe-cat-prod",
            "category_ids": [cat_id, cat_id],
            "price": "199.00",
        },
    )
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "DUPLICATE_CATEGORY_ASSIGNMENT"

def test_category_filter_works_with_many_to_many():
    db = TestingSessionLocal()
    cat1 = create_test_category(db, name="Cat A", slug="cat-a")
    cat2 = create_test_category(db, name="Cat B", slug="cat-b")
    cat1_id = cat1.id
    cat2_id = cat2.id

    # Product 1 is in Cat A only
    create_test_product(db, [cat1.id], name="Product A Only", slug="prod-a-only")
    # Product 2 is in Cat A and Cat B
    create_test_product(db, [cat1.id, cat2.id], name="Product Both", slug="prod-both")
    # Product 3 is in Cat B only
    create_test_product(db, [cat2.id], name="Product B Only", slug="prod-b-only")
    db.close()

    res_a = client.get(f"/api/v1/products?category={cat1_id}")
    assert res_a.status_code == 200
    names_a = [p["name"] for p in res_a.json()["data"]]
    assert len(names_a) == 2
    assert "Product A Only" in names_a
    assert "Product Both" in names_a

    res_b = client.get(f"/api/v1/products?category={cat2_id}")
    assert res_b.status_code == 200
    names_b = [p["name"] for p in res_b.json()["data"]]
    assert len(names_b) == 2
    assert "Product B Only" in names_b
    assert "Product Both" in names_b

def test_product_create_accepts_multiple_category_ids():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat1 = create_test_category(db, name="IoT", slug="iot")
    cat2 = create_test_category(db, name="Wireless", slug="wireless")
    cat1_id = str(cat1.id)
    cat2_id = str(cat2.id)
    db.close()

    res = client.post(
        "/api/v1/admin/products",
        headers=headers,
        json={
            "name": "ESP32 Dev Module",
            "slug": "esp32-dev-module",
            "category_ids": [cat1_id, cat2_id],
            "price": "599.00",
            "cost_price": "350.00",
        },
    )
    assert res.status_code == 201
    data = res.json()["data"]
    assert len(data["category_ids"]) == 2
    assert cat1_id in data["category_ids"]
    assert cat2_id in data["category_ids"]

def test_product_update_changes_categories():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat1 = create_test_category(db, name="Old Cat", slug="old-cat")
    cat2 = create_test_category(db, name="New Cat", slug="new-cat")
    cat2_id = str(cat2.id)
    prod = create_test_product(db, [cat1.id], name="Evolving Product", slug="evolving-prod")
    prod_id = prod.id
    db.close()

    res = client.patch(
        f"/api/v1/admin/products/{prod_id}",
        headers=headers,
        json={"category_ids": [cat2_id]},
    )
    assert res.status_code == 200
    assert res.json()["data"]["category_ids"] == [cat2_id]

# ---------------------------------------------------------------------------
# PRODUCT IMAGE UPLOAD TESTS (ADMIN-CAT-API-004 / CORRECTION #1)
# ---------------------------------------------------------------------------

def test_admin_product_image_upload_multipart_success():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    admin_id = admin.id
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    prod = create_test_product(db, [cat.id], name="Visual Board", slug="visual-board")
    prod_id = prod.id
    db.close()

    valid_image_bytes = (
        b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
    )
    res = client.post(
        f"/api/v1/admin/products/{prod_id}/images",
        headers=headers,
        files={"file": ("board_front.gif", valid_image_bytes, "image/gif")},
    )
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["product_id"] == str(prod_id)
    assert "cloudinary.com" in data["image_url"]
    assert len(data["images"]) == 1
    assert data["primary_image_url"] == data["image_url"]

    # Verify audit event
    db = TestingSessionLocal()
    audit = db.query(AuditEvent).filter(AuditEvent.action == "UPLOAD_PRODUCT_IMAGE").first()
    assert audit is not None
    assert audit.user_id == admin_id
    assert audit.entity_id == prod_id
    db.close()

def test_admin_product_image_upload_json_url_success():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    prod = create_test_product(db, [cat.id])
    prod_id = prod.id
    db.close()

    res = client.post(
        f"/api/v1/admin/products/{prod_id}/images",
        headers=headers,
        json={"image_url": "https://res.cloudinary.com/venopai/image/upload/sample.jpg"},
    )
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["image_url"] == "https://res.cloudinary.com/venopai/image/upload/sample.jpg"

def test_image_upload_requires_admin():
    db = TestingSessionLocal()
    cat = create_test_category(db)
    prod = create_test_product(db, [cat.id])
    prod_id = prod.id
    db.close()

    res = client.post(f"/api/v1/admin/products/{prod_id}/images")
    assert res.status_code == 401

def test_customer_cannot_upload_product_image():
    db = TestingSessionLocal()
    customer = create_test_customer(db)
    headers = get_customer_headers(customer)
    cat = create_test_category(db)
    prod = create_test_product(db, [cat.id])
    prod_id = prod.id
    db.close()

    res = client.post(f"/api/v1/admin/products/{prod_id}/images", headers=headers)
    assert res.status_code == 403

def test_unauthorized_admin_role_cannot_upload_product_image():
    db = TestingSessionLocal()
    # Admin with FINANCE_MANAGER role (not ORDER_MANAGER or SUPER_ADMIN)
    finance_admin = create_test_admin(db, role="FINANCE_MANAGER")
    headers = get_admin_headers(finance_admin)
    cat = create_test_category(db)
    prod = create_test_product(db, [cat.id])
    prod_id = prod.id
    db.close()

    res = client.post(f"/api/v1/admin/products/{prod_id}/images", headers=headers)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "INSUFFICIENT_ROLE"

def test_invalid_product_rejected_on_image_upload():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    db.close()

    fake_id = uuid.uuid4()
    res = client.post(
        f"/api/v1/admin/products/{fake_id}/images",
        headers=headers,
        files={"file": ("test.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 50, "image/png")},
    )
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "PRODUCT_NOT_FOUND"

def test_invalid_image_rejected():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    prod = create_test_product(db, [cat.id])
    prod_id = prod.id
    db.close()

    # Empty bytes
    res = client.post(
        f"/api/v1/admin/products/{prod_id}/images",
        headers=headers,
        files={"file": ("empty.jpg", b"", "image/jpeg")},
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_IMAGE"

    # Unsupported format (e.g. .exe)
    res_exe = client.post(
        f"/api/v1/admin/products/{prod_id}/images",
        headers=headers,
        files={"file": ("malware.exe", b"MZ" + b"\x00" * 20, "application/octet-stream")},
    )
    assert res_exe.status_code == 400
    assert res_exe.json()["error"]["code"] == "INVALID_IMAGE"

def test_cloudinary_failure_handled():
    db = TestingSessionLocal()
    admin = create_test_admin(db)
    headers = get_admin_headers(admin)
    cat = create_test_category(db)
    prod = create_test_product(db, [cat.id])
    prod_id = prod.id
    db.close()

    fake_image_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 50
    with patch("app.services.catalog.cloudinary_provider.upload", side_effect=RuntimeError("Cloudinary gateway timed out")):
        res = client.post(
            f"/api/v1/admin/products/{prod_id}/images",
            headers=headers,
            files={"file": ("test.jpg", fake_image_bytes, "image/jpeg")},
        )
        assert res.status_code == 502
        assert res.json()["error"]["code"] == "IMAGE_UPLOAD_FAILED"

# ---------------------------------------------------------------------------
# ADMIN CATEGORY TESTS
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
    cat_id = str(cat.id)
    db.close()

    payload = {
        "name": "Robotic Arm Kit",
        "slug": "robotic-arm-kit",
        "sku": "ROBO-001",
        "category_ids": [cat_id],
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
    prod = create_test_product(db, [cat.id], name="Test Device", slug="test-device", status="draft")
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
    prod = create_test_product(db, [cat.id], stock_quantity=25, reserved_quantity=5)
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
    prod = create_test_product(db, [cat.id], stock_quantity=10, reserved_quantity=0)
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
    prod = create_test_product(db, [cat.id], stock_quantity=20, reserved_quantity=2)
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
    prod = create_test_product(db, [cat.id], stock_quantity=5, reserved_quantity=0)
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
    prod = create_test_product(db, [cat.id], stock_quantity=10, reserved_quantity=8)
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
    prod = create_test_product(db, [cat.id], stock_quantity=10)
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
    create_test_product(db, [cat.id], slug="unique-slug-1")
    db.close()

    res = client.post(
        "/api/v1/admin/products",
        headers=headers,
        json={
            "name": "Another Product",
            "slug": "unique-slug-1",
            "category_ids": [cat_id],
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
    create_test_product(db, [cat.id], stock_quantity=12, reserved_quantity=2)
    create_test_product(db, [cat.id], stock_quantity=20, reserved_quantity=5)
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
    prod = create_test_product(db, [cat.id])
    prod_id = str(prod.id)
    db.close()

    res = client.get(f"/api/v1/admin/inventory/{prod_id}/reservations", headers=headers)
    assert res.status_code == 200
    assert res.json()["data"] == []


def test_admin_catalog_rbac_matrix():
    """Document 04 §40: ADMIN-CAT-API Scoped to ORDER_MANAGER and SUPER_ADMIN.
    1. SUPER_ADMIN can access catalog operations.
    2. ORDER_MANAGER can access catalog operations.
    3. SUPPORT_EXECUTIVE is denied (403).
    4. MANUFACTURING_MANAGER is denied (403).
    5. FINANCE_MANAGER is denied (403).
    6. Customers are denied (403).
    """
    db = TestingSessionLocal()
    cat = create_test_category(db)
    cat_id = str(cat.id)

    super_admin = create_test_admin(db, role="SUPER_ADMIN")
    order_mgr = User(
        id=uuid.uuid4(),
        email=f"ordermgr_{uuid.uuid4().hex[:6]}@venopai.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Order Manager",
        status="verified",
        role="ORDER_MANAGER",
        is_active=True,
        is_superuser=False,
    )
    support_exec = User(
        id=uuid.uuid4(),
        email=f"support_{uuid.uuid4().hex[:6]}@venopai.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Support Executive",
        status="verified",
        role="SUPPORT_EXECUTIVE",
        is_active=True,
        is_superuser=False,
    )
    mfg_mgr = User(
        id=uuid.uuid4(),
        email=f"mfg_{uuid.uuid4().hex[:6]}@venopai.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Manufacturing Manager",
        status="verified",
        role="MANUFACTURING_MANAGER",
        is_active=True,
        is_superuser=False,
    )
    fin_mgr = User(
        id=uuid.uuid4(),
        email=f"fin_{uuid.uuid4().hex[:6]}@venopai.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Finance Manager",
        status="verified",
        role="FINANCE_MANAGER",
        is_active=True,
        is_superuser=False,
    )
    customer = create_test_customer(db)
    db.add_all([order_mgr, support_exec, mfg_mgr, fin_mgr])
    db.commit()

    # 1. SUPER_ADMIN -> Allowed (200)
    res_sa = client.get("/api/v1/admin/products", headers=get_admin_headers(super_admin))
    assert res_sa.status_code == 200

    # 2. ORDER_MANAGER -> Allowed (200 & 201)
    res_om = client.get("/api/v1/admin/products", headers=get_admin_headers(order_mgr))
    assert res_om.status_code == 200

    res_om_create = client.post(
        "/api/v1/admin/products",
        headers=get_admin_headers(order_mgr),
        json={
            "name": "OM Created Product",
            "slug": "om-created-product",
            "category_ids": [cat_id],
            "price": "299.00",
        },
    )
    assert res_om_create.status_code == 201

    # 3. SUPPORT_EXECUTIVE -> 403 Forbidden
    res_se = client.get("/api/v1/admin/products", headers=get_admin_headers(support_exec))
    assert res_se.status_code == 403
    assert res_se.json()["error"]["code"] == "INSUFFICIENT_ROLE"

    # 4. MANUFACTURING_MANAGER -> 403 Forbidden
    res_mm = client.get("/api/v1/admin/products", headers=get_admin_headers(mfg_mgr))
    assert res_mm.status_code == 403
    assert res_mm.json()["error"]["code"] == "INSUFFICIENT_ROLE"

    # 5. FINANCE_MANAGER -> 403 Forbidden
    res_fm = client.get("/api/v1/admin/products", headers=get_admin_headers(fin_mgr))
    assert res_fm.status_code == 403
    assert res_fm.json()["error"]["code"] == "INSUFFICIENT_ROLE"

    # 6. Customer -> 403 Forbidden
    res_cust = client.get("/api/v1/admin/products", headers=get_customer_headers(customer))
    assert res_cust.status_code == 403

    db.close()

