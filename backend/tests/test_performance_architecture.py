import uuid
import json
import time
import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timezone

from app.main import app
from app.models.user import User
from app.models.catalog import Category, Product, Inventory, InventoryReservation, ProductCategory
from app.core.security import get_password_hash, create_access_token
from app.core.cache import cache_get, cache_set, cache_delete, cache_delete_pattern
from tests.test_utils import TestingSessionLocal

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_perf_db():
    cache_delete_pattern("cache:*")
    db = TestingSessionLocal()
    db.query(InventoryReservation).delete()
    db.query(Inventory).delete()
    db.query(ProductCategory).delete()
    db.query(Product).delete()
    db.query(Category).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def test_core_cache_set_get_and_delete():
    """Verify set, get, pattern delete, and typed object serialization in cache."""
    test_key = "cache:test:item"
    payload = {
        "id": str(uuid.uuid4()),
        "name": "Microcontroller Board",
        "price": "650.00",
        "active": True,
        "count": 42,
    }

    assert cache_set(test_key, payload, ttl_seconds=60) is True
    cached = cache_get(test_key)
    assert cached == payload

    # Test pattern deletion
    deleted = cache_delete_pattern("cache:test:*")
    assert deleted >= 1
    assert cache_get(test_key) is None


def test_category_tree_cached_and_invalidated_on_admin_write():
    """Verify GET /categories is cached and evicted when an admin creates a new category."""
    db = TestingSessionLocal()
    c1 = Category(name="Sensors", slug="sensors", is_active=True)
    db.add(c1)
    db.commit()

    # First request populates cache
    res1 = client.get("/api/v1/categories")
    assert res1.status_code == 200
    assert len(res1.json()["data"]) == 1
    assert res1.json()["data"][0]["name"] == "Sensors"

    # Verify key in cache
    cached_val = cache_get("cache:cat:tree")
    assert cached_val is not None
    assert len(cached_val) == 1

    # Create admin user
    admin = User(
        email="admin_perf@example.com",
        hashed_password=get_password_hash("AdminPass123!"),
        full_name="Admin Perf",
        is_active=True,
        is_superuser=True,
        role="SUPER_ADMIN",
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    db.close()

    admin_token = create_access_token(
        subject=str(admin.id), role="SUPER_ADMIN", is_admin=True, audience="admin"
    )


    # Admin creates another category -> must evict cache:cat:*
    res_admin = client.post(
        "/api/v1/admin/categories",
        json={"name": "Microcontrollers", "slug": "microcontrollers"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_admin.status_code == 201

    # Verify cache:cat:tree was evicted
    assert cache_get("cache:cat:tree") is None

    # Next GET /categories retrieves both
    res2 = client.get("/api/v1/categories")
    assert res2.status_code == 200
    assert len(res2.json()["data"]) == 2


def test_product_detail_cached_and_evicted_on_stock_adjustment():
    """Verify product detail is cached and evicted upon manual inventory adjustment."""
    db = TestingSessionLocal()
    p = Product(
        name="ESP32-S3 Pro",
        slug="esp32-s3-pro",
        description="Dual core 240MHz",
        price_paise=75000,
        status="active",
    )
    db.add(p)
    db.flush()
    inv = Inventory(product_id=p.id, stock_quantity=20, reserved_quantity=0)
    db.add(inv)

    admin = User(
        email="admin_inv@example.com",
        hashed_password=get_password_hash("AdminPass123!"),
        full_name="Admin Inv",
        is_active=True,
        is_superuser=True,
        role="SUPER_ADMIN",
    )
    db.add(admin)
    db.commit()
    pid = str(p.id)
    admin_id = str(admin.id)
    db.close()

    # GET product details
    res = client.get(f"/api/v1/products/{pid}")
    assert res.status_code == 200
    assert res.json()["data"]["price"] == "750.00"

    # Verify cached
    assert cache_get(f"cache:prod:detail:{pid}") is not None

    admin_token = create_access_token(
        subject=admin_id, role="SUPER_ADMIN", is_admin=True, audience="admin"
    )


    # Admin adjusts stock
    res_adj = client.post(
        f"/api/v1/admin/inventory/{pid}/adjust",
        json={"delta": 5, "reason": "Replenishment batch #99"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_adj.status_code == 200

    # Verify product cache key was invalidated
    assert cache_get(f"cache:prod:detail:{pid}") is None


def test_pincode_serviceability_caching():
    """Verify 24h caching on destination pincode serviceability checks."""
    pincode = "560001"
    cache_delete(f"cache:ship:pincode:{pincode}")

    res = client.get(f"/api/v1/shipping/serviceability?pincode={pincode}")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["pincode"] == pincode
    assert data["serviceable"] is True

    # Verify cached in Redis/memory
    cached = cache_get(f"cache:ship:pincode:{pincode}")
    assert cached is not None
    assert cached["pincode"] == pincode
    assert cached["serviceable"] is True


def test_search_autocomplete_caching():
    """Verify autocomplete result is stored in cache:search:ac:{q}."""
    db = TestingSessionLocal()
    p = Product(name="STM32F4 Discovery", slug="stm32f4-disc", description="ARM Cortex-M4", price_paise=120000, status="active")
    db.add(p)
    db.commit()
    db.close()

    cache_delete("cache:search:ac:stm")
    res = client.get("/api/v1/search/autocomplete?q=STM")
    assert res.status_code == 200
    assert "STM32F4 Discovery" in res.json()["data"]["suggestions"]

    # Check cache hit
    cached = cache_get("cache:search:ac:stm")
    assert cached is not None
    assert "STM32F4 Discovery" in cached["suggestions"]


def test_cart_rate_limiting_exceeded_429(monkeypatch):
    """Verify cart addition rate limiter triggers 429 when burst limit is breached."""
    monkeypatch.setenv("TEST_RATE_LIMIT", "1")
    db = TestingSessionLocal()
    user = User(
        email="cart_shopper@example.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Shopper",
        is_active=True,
    )
    p = Product(name="Test Resistor", slug="test-resistor", price_paise=500, status="active")
    db.add_all([user, p])
    db.commit()
    uid = str(user.id)
    pid = str(p.id)
    db.close()

    user_token = create_access_token(subject=uid)

    headers = {
        "Authorization": f"Bearer {user_token}",
        "X-Forwarded-For": "203.0.113.88",
    }

    status_codes = []
    # Limit is 30 requests / 60 seconds
    for _ in range(35):
        res = client.post(
            "/api/v1/cart/items",
            json={"product_id": pid, "quantity": 1},
            headers=headers,
        )
        status_codes.append(res.status_code)

    assert 429 in status_codes
    # Verify Retry-After header present on 429
    idx_429 = status_codes.index(429)
    assert idx_429 <= 31
