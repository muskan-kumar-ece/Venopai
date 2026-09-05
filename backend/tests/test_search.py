import uuid
import json
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User
from app.models.catalog import Category, Product, Inventory, InventoryReservation, ProductCategory
from app.core.security import get_password_hash
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_search_db():
    db = TestingSessionLocal()
    db.query(InventoryReservation).delete()
    db.query(Inventory).delete()
    db.query(ProductCategory).delete()
    db.query(Product).delete()
    db.query(Category).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def create_product(db, name, description, price_paise=100000, status="active", specs=None, stock=10):
    p = Product(
        name=name,
        slug=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:4]}",
        description=description,
        price_paise=price_paise,
        status=status,
        specifications=json.dumps(specs or [{"key": "Processor", "value": "ATmega328P"}]),
    )
    db.add(p)
    db.flush()
    inv = Inventory(product_id=p.id, stock_quantity=stock, reserved_quantity=0)
    db.add(inv)
    db.commit()
    db.refresh(p)
    return p


def test_search_missing_q_returns_400():
    res = client.get("/api/v1/search/products")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "MISSING_SEARCH_QUERY"


def test_search_by_name():
    db = TestingSessionLocal()
    create_product(db, "Arduino Uno R3", "Development board")
    create_product(db, "Raspberry Pi 4", "Single board computer")
    db.close()

    res = client.get("/api/v1/search/products?q=Arduino")
    assert res.status_code == 200
    data = res.json()
    assert data["query"] == "Arduino"
    assert len(data["data"]) == 1
    assert data["data"][0]["name"] == "Arduino Uno R3"
    assert data["pagination"]["total_items"] == 1


def test_search_by_description():
    db = TestingSessionLocal()
    create_product(db, "Custom Board", "A compact Arduino compatible controller")
    create_product(db, "Power Supply", "5V 2A adapter")
    db.close()

    res = client.get("/api/v1/search/products?q=Arduino")
    assert res.status_code == 200
    data = res.json()
    assert len(data["data"]) == 1
    assert data["data"][0]["name"] == "Custom Board"


def test_search_by_specifications():
    db = TestingSessionLocal()
    create_product(db, "Sensor Module", "Digital temperature sensor", specs=[{"key": "SensorType", "value": "DS18B20"}])
    create_product(db, "Motor Driver", "Dual H-Bridge module", specs=[{"key": "Chip", "value": "L298N"}])
    db.close()

    res = client.get("/api/v1/search/products?q=DS18B20")
    assert res.status_code == 200
    data = res.json()
    assert len(data["data"]) == 1
    assert data["data"][0]["name"] == "Sensor Module"


def test_search_excludes_draft_and_inactive():
    db = TestingSessionLocal()
    create_product(db, "Active Arduino", "Active board", status="active")
    create_product(db, "Draft Arduino", "Draft board", status="draft")
    create_product(db, "Inactive Arduino", "Inactive board", status="inactive")
    db.close()

    res = client.get("/api/v1/search/products?q=Arduino")
    assert res.status_code == 200
    data = res.json()
    assert len(data["data"]) == 1
    assert data["data"][0]["name"] == "Active Arduino"


def test_search_out_of_stock_remains_visible():
    db = TestingSessionLocal()
    create_product(db, "Out of Stock Arduino", "Sold out board", stock=0)
    db.close()

    res = client.get("/api/v1/search/products?q=Arduino")
    assert res.status_code == 200
    data = res.json()
    assert len(data["data"]) == 1
    assert data["data"][0]["stock_status"] == "out_of_stock"


def test_search_filter_availability():
    db = TestingSessionLocal()
    create_product(db, "In Stock Arduino", "In stock board", stock=5)
    create_product(db, "Out of Stock Arduino", "Out of stock board", stock=0)
    db.close()

    res = client.get("/api/v1/search/products?q=Arduino&availability=in_stock")
    assert res.status_code == 200
    assert len(res.json()["data"]) == 1
    assert res.json()["data"][0]["name"] == "In Stock Arduino"

    res = client.get("/api/v1/search/products?q=Arduino&availability=out_of_stock")
    assert res.status_code == 200
    assert len(res.json()["data"]) == 1
    assert res.json()["data"][0]["name"] == "Out of Stock Arduino"


def test_search_filter_price():
    db = TestingSessionLocal()
    create_product(db, "Cheap Arduino", "Basic board", price_paise=50000)  # 500.00
    create_product(db, "Expensive Arduino", "Pro board", price_paise=250000) # 2500.00
    db.close()

    res = client.get("/api/v1/search/products?q=Arduino&min_price=1000.00")
    assert res.status_code == 200
    assert len(res.json()["data"]) == 1
    assert res.json()["data"][0]["name"] == "Expensive Arduino"

    res = client.get("/api/v1/search/products?q=Arduino&max_price=1000.00")
    assert res.status_code == 200
    assert len(res.json()["data"]) == 1
    assert res.json()["data"][0]["name"] == "Cheap Arduino"


def test_search_sorting():
    db = TestingSessionLocal()
    create_product(db, "Arduino 1", "desc", price_paise=30000)
    create_product(db, "Arduino 2", "desc", price_paise=10000)
    create_product(db, "Arduino 3", "desc", price_paise=20000)
    db.close()

    res = client.get("/api/v1/search/products?q=Arduino&sort=price_asc")
    prices = [p["price"] for p in res.json()["data"]]
    assert prices == ["100.00", "200.00", "300.00"]

    res = client.get("/api/v1/search/products?q=Arduino&sort=price_desc")
    prices = [p["price"] for p in res.json()["data"]]
    assert prices == ["300.00", "200.00", "100.00"]


def test_search_empty_returns_suggested_categories_srch_002():
    db = TestingSessionLocal()
    cat1 = Category(name="Microcontrollers", slug="microcontrollers", is_active=True)
    cat2 = Category(name="Sensors", slug="sensors", is_active=True)
    db.add_all([cat1, cat2])
    db.commit()
    db.close()

    res = client.get("/api/v1/search/products?q=NonExistentDevice123")
    assert res.status_code == 200
    data = res.json()
    assert len(data["data"]) == 0
    assert data["pagination"]["total_items"] == 0
    assert "suggested_categories" in data
    assert len(data["suggested_categories"]) > 0
    names = [c["name"] for c in data["suggested_categories"]]
    assert "Microcontrollers" in names or "Sensors" in names


def test_autocomplete_min_length():
    res = client.get("/api/v1/search/autocomplete?q=a")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_AUTOCOMPLETE_QUERY"


def test_autocomplete_returns_capped_8_suggestions():
    db = TestingSessionLocal()
    for i in range(12):
        create_product(db, f"Arduino Item {i:02d}", "desc")
    db.close()

    res = client.get("/api/v1/search/autocomplete?q=Arduino")
    assert res.status_code == 200
    suggestions = res.json()["data"]["suggestions"]
    assert len(suggestions) <= 8
    assert all("Arduino" in s for s in suggestions)
