import uuid
import json
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User
from app.models.catalog import Category, Product, Inventory
from app.models.order import Order, OrderItem, Shipment, Payment
from app.models.project import ProjectFile
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

def create_user(db, role="customer"):
    user = User(
        email=f"user_{uuid.uuid4().hex[:6]}@venopai.com",
        hashed_password=get_password_hash("SecretPassword123!"),
        full_name="Dr. Testing Scientist",
        status="verified",
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def auth_headers(user):
    token = create_access_token(
        subject=str(user.id),
        role=user.role,
        is_admin=user.role == "SUPER_ADMIN",
        audience="customer" if user.role == "customer" else "admin",
    )
    return {"Authorization": f"Bearer {token}"}

class TestAuditFrictionFixes:
    def test_catalog_category_slug_and_uuid_resolution(self):
        db = TestingSessionLocal()
        try:
            # 1. Create test category with slug
            cat = Category(
                name="Microcontrollers & SoC",
                slug="microcontrollers",
                is_active=True,
            )
            db.add(cat)
            db.commit()
            db.refresh(cat)

            # 2. Create product in that category
            prod = Product(
                name="STM32F401 Development Board",
                slug=f"stm32f401-{uuid.uuid4().hex[:6]}",
                sku=f"VNP-MCU-{uuid.uuid4().hex[:4].upper()}",
                price_paise=129900,
                status="active",
            )
            prod.categories.append(cat)
            db.add(prod)
            db.commit()
            db.refresh(prod)

            inv = Inventory(product_id=prod.id, stock_quantity=20, reserved_quantity=0)
            db.add(inv)
            db.commit()

            # Test 1: Query by slug directly - MUST NOT return 400
            res = client.get("/api/v1/products?category=microcontrollers")
            assert res.status_code == 200
            data = res.json()
            assert len(data["data"]) >= 1
            assert any(p["id"] == str(prod.id) for p in data["data"])

            # Test 2: Query by UUID - MUST ALSO work
            res_uuid = client.get(f"/api/v1/products?category={cat.id}")
            assert res_uuid.status_code == 200
            data_uuid = res_uuid.json()
            assert any(p["id"] == str(prod.id) for p in data_uuid["data"])

            # Test 3: Get Category detail by slug
            res_cat_slug = client.get("/api/v1/categories/microcontrollers")
            assert res_cat_slug.status_code == 200
            assert res_cat_slug.json()["data"]["category"]["slug"] == "microcontrollers"

            # Test 4: Query unknown slug returns empty list (200 OK, not 400)
            res_unknown = client.get("/api/v1/products?category=non-existent-category-xyz")
            assert res_unknown.status_code == 200
            assert len(res_unknown.json()["data"]) == 0
        finally:
            db.close()

    def test_public_order_tracking(self):
        db = TestingSessionLocal()
        try:
            user = create_user(db)
            order_num = f"ORD-TRACK-{uuid.uuid4().hex[:6].upper()}"
            awb_num = f"143249{uuid.uuid4().hex[:6]}"

            order = Order(
                order_number=order_num,
                user_id=user.id,
                status="shipped",
                subtotal_paise=240000,
                total_paise=240000,
                shipping_address_snapshot=json.dumps({
                    "city": "Bengaluru",
                    "state": "Karnataka",
                    "pincode": "560001",
                }),
            )
            db.add(order)
            db.commit()
            db.refresh(order)

            shipment = Shipment(
                order_id=order.id,
                tracking_number=awb_num,
                carrier="Shiprocket Express",
                status="in_transit",
            )
            db.add(shipment)
            db.commit()

            # Test 1: Track by order_number
            res_order = client.get(f"/api/v1/orders/track/public?order_number={order_num}")
            assert res_order.status_code == 200
            data = res_order.json()["data"]
            assert data["order_number"] == order_num
            assert data["carrier"] == "Shiprocket Express"
            assert data["tracking_number"] == awb_num
            assert "Bengaluru" in data["destination"]
            assert len(data["milestones"]) == 4

            # Test 2: Track by AWB
            res_awb = client.get(f"/api/v1/orders/track/public?awb={awb_num}")
            assert res_awb.status_code == 200
            assert res_awb.json()["data"]["order_number"] == order_num

            # Test 3: Missing params returns 400
            res_missing = client.get("/api/v1/orders/track/public")
            assert res_missing.status_code == 400

            # Test 4: Unknown order returns 404
            res_404 = client.get("/api/v1/orders/track/public?order_number=ORD-DOES-NOT-EXIST")
            assert res_404.status_code == 404
        finally:
            db.close()

    def test_customer_file_listing_api(self):
        db = TestingSessionLocal()
        try:
            user1 = create_user(db)
            user2 = create_user(db)

            # Add file for user1
            f1 = ProjectFile(
                owner_id=user1.id,
                filename="esp32_firmware_v1.bin",
                content_type="application/octet-stream",
                size_bytes=1048576,
                scan_status="clean",
                association_type="software",
                storage_ref="venopai/files/f1",
            )
            # Add file for user2
            f2 = ProjectFile(
                owner_id=user2.id,
                filename="secret_pcb_gerbers.zip",
                content_type="application/zip",
                size_bytes=2048576,
                scan_status="clean",
                association_type="manufacturing",
                storage_ref="venopai/files/f2",
            )
            db.add_all([f1, f2])
            db.commit()

            # Test 1: User 1 lists files - sees only f1, NOT f2 (IDOR protection)
            res = client.get("/api/v1/files", headers=auth_headers(user1))
            assert res.status_code == 200
            files = res.json()["data"]
            assert len(files) == 1
            assert files[0]["file_name"] == "esp32_firmware_v1.bin"
            assert files[0]["association_type"] == "software"

            # Test 2: Search filtering
            res_search = client.get("/api/v1/files?search=esp32", headers=auth_headers(user1))
            assert len(res_search.json()["data"]) == 1

            res_search_empty = client.get("/api/v1/files?search=nonexistent", headers=auth_headers(user1))
            assert len(res_search_empty.json()["data"]) == 0
        finally:
            db.close()

    def test_order_invoice_download_html(self):
        db = TestingSessionLocal()
        try:
            user = create_user(db)
            order_num = f"ORD-INV-{uuid.uuid4().hex[:6].upper()}"

            order = Order(
                order_number=order_num,
                user_id=user.id,
                status="paid",
                subtotal_paise=150000,
                tax_amount_paise=27000,
                total_paise=177000,
                shipping_address_snapshot=json.dumps({
                    "full_name": "Dr. Testing Scientist",
                    "address_line1": "National Lab 4B",
                    "city": "Pune",
                    "state": "Maharashtra",
                    "pincode": "411007",
                }),
            )
            db.add(order)
            db.commit()
            db.refresh(order)

            # Test 1: Request invoice download via Bearer auth
            res = client.get(f"/api/v1/orders/{order.id}/invoice/download", headers=auth_headers(user))
            assert res.status_code == 200
            assert "text/html" in res.headers["content-type"]
            html = res.text
            assert "VenopAI Technologies" in html
            assert "27ABCDE1234F1Z5" in html  # GSTIN
            assert order_num in html
            assert "TAX INVOICE" in html

            # Test 2: Request via query token
            token = create_access_token(subject=str(user.id), audience="customer")
            res_token = client.get(f"/api/v1/orders/{order.id}/invoice/download?token={token}")
            assert res_token.status_code == 200
            assert "VenopAI Technologies" in res_token.text

            # Test 3: Unauthorized user without token returns 401
            res_unauth = client.get(f"/api/v1/orders/{order.id}/invoice/download")
            assert res_unauth.status_code == 401
        finally:
            db.close()
