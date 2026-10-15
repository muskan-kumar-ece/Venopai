"""Unit and integration tests for Shiprocket Phase 2:
- Origin PIN Configuration & Validation
- Package Dead Weight, Volumetric Weight (divisor 5000) & Billable Weight (0.5kg min floor)
- Dimensions String Parser & Tare Weight
- Live Serviceability (available couriers, empty couriers, 404/422 unserviceable, 5xx provider error)
- Live Shipping Rates Calculation & Courier Selection Strategies (cheapest, recommended, fastest)
- Precise Decimal-to-Paise Currency Conversion
- Strict Separation: Carrier Unserviceable (422) vs Provider Outage (503)
- Address & Checkout Integration: Tax Recalculation, Shipping Snapshots, Reservation Timer Preservation
- Simulation Mode Determinism
"""
from decimal import Decimal
import json
from unittest.mock import MagicMock, patch
import uuid
import pytest
import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings, Settings
from app.integrations.shiprocket.auth import ShiprocketAuthManager
from app.integrations.shiprocket.client import ShiprocketProvider, shiprocket_provider
from app.integrations.shiprocket.http_client import ShiprocketHttpClient
from app.integrations.shiprocket.exceptions import (
    ShiprocketError,
    ShiprocketConfigError,
    ShiprocketResponseError,
    ShiprocketConnectionError,
)
from app.integrations.shiprocket.weight import (
    calculate_volumetric_weight_kg,
    parse_dimensions_string,
    calculate_package_measurements,
    DEFAULT_VOLUMETRIC_DIVISOR,
    MIN_BILLABLE_WEIGHT_KG,
)
from app.models.user import User, Address
from app.models.catalog import Product, Category, Inventory
from app.models.order import Cart, CartItem, CheckoutSession
from app.services.address import _serialize_address
from app.services.checkout import create_checkout_session, change_checkout_address
from app.core.security import get_password_hash
from tests.test_utils import TestingSessionLocal


client = TestClient(app)


class MockHttpTransport(httpx.BaseTransport):
    def __init__(self, handler):
        self.handler = handler

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        return self.handler(request)


@pytest.fixture
def db():
    session = TestingSessionLocal()
    yield session
    session.close()


# -------------------------------------------------------------------------
# 1. Configuration & Origin PIN Validation Tests
# -------------------------------------------------------------------------

def test_origin_pincode_default_and_validation():
    """Verify default origin PIN is 500090 (Mallampet, Hyderabad) and validates properly."""
    assert settings.SHIPROCKET_ORIGIN_PINCODE == "500090"

    # Valid 6-digit Indian PIN
    valid_cfg = Settings(SHIPROCKET_ORIGIN_PINCODE="500072")
    assert valid_cfg.SHIPROCKET_ORIGIN_PINCODE == "500072"

    # Invalid PINs: non-numeric, wrong length, starts with 0
    with pytest.raises(ValueError, match="6-digit Indian PIN"):
        Settings(SHIPROCKET_ORIGIN_PINCODE="50009")

    with pytest.raises(ValueError, match="6-digit Indian PIN"):
        Settings(SHIPROCKET_ORIGIN_PINCODE="5000901")

    with pytest.raises(ValueError, match="6-digit Indian PIN"):
        Settings(SHIPROCKET_ORIGIN_PINCODE="050090")

    with pytest.raises(ValueError, match="6-digit Indian PIN"):
        Settings(SHIPROCKET_ORIGIN_PINCODE="50009A")


def test_courier_selection_strategy_validation():
    """Verify strategy validator accepts cheapest, recommended, fastest, and rejects others."""
    assert settings.SHIPROCKET_COURIER_SELECTION_STRATEGY in ("cheapest", "recommended", "fastest")

    for valid in ("cheapest", "recommended", "fastest", "CHEAPEST", "Fastest"):
        cfg = Settings(SHIPROCKET_COURIER_SELECTION_STRATEGY=valid)
        assert cfg.SHIPROCKET_COURIER_SELECTION_STRATEGY == valid.lower()

    with pytest.raises(ValueError, match="SHIPROCKET_COURIER_SELECTION_STRATEGY must be one of"):
        Settings(SHIPROCKET_COURIER_SELECTION_STRATEGY="arbitrary_courier")


# -------------------------------------------------------------------------
# 2. Package Weight & Volumetric Measurement Tests
# -------------------------------------------------------------------------

def test_volumetric_weight_formula():
    """Verify volumetric weight uses standard divisor 5000: (L x B x H) / 5000."""
    # 50cm x 40cm x 30cm = 60000 / 5000 = 12.0 kg
    vol = calculate_volumetric_weight_kg(50, 40, 30)
    assert vol == 12.0

    # 10cm x 10cm x 10cm = 1000 / 5000 = 0.2 kg
    vol_small = calculate_volumetric_weight_kg(10, 10, 10)
    assert vol_small == 0.2


def test_volumetric_weight_invalid_inputs_safety():
    """Verify missing, zero, negative, or non-numeric dimensions safely return 0.0."""
    assert calculate_volumetric_weight_kg(None, 10, 10) == 0.0
    assert calculate_volumetric_weight_kg(10, None, 10) == 0.0
    assert calculate_volumetric_weight_kg(10, 10, None) == 0.0
    assert calculate_volumetric_weight_kg(0, 10, 10) == 0.0
    assert calculate_volumetric_weight_kg(-15, 20, 10) == 0.0
    assert calculate_volumetric_weight_kg("invalid", 10, 10) == 0.0


def test_parse_dimensions_string():
    """Verify parsing of dimensions strings like '10 x 20 x 30 cm' or '15*10*5'."""
    parsed = parse_dimensions_string("10 x 20 x 30 cm")
    assert parsed == (10.0, 20.0, 30.0)

    parsed_star = parse_dimensions_string("15.5 * 10 * 5.2")
    assert parsed_star == (15.5, 10.0, 5.2)

    assert parse_dimensions_string(None) is None
    assert parse_dimensions_string("no dimensions") is None
    assert parse_dimensions_string("10 x 20") is None  # Only 2 dimensions


def test_package_measurements_billable_weight_rules():
    """Verify:
    1. Dead weight > Volumetric -> Dead weight is billable
    2. Volumetric > Dead weight -> Volumetric is billable
    3. Minimum billable weight floor (0.5 kg) is enforced
    4. Packaging tare weight is properly incorporated
    """
    # 1. Dead weight dominates: 2500g dead vs (10x10x10=0.2kg vol) -> 2.5 kg billable
    m1 = calculate_package_measurements(dead_weight_grams=2500, length_cm=10, breadth_cm=10, height_cm=10)
    assert m1["dead_weight_kg"] == 2.5
    assert m1["volumetric_weight_kg"] == 0.2
    assert m1["billable_weight_kg"] == 2.5
    assert not m1["is_volumetric"]
    assert not m1["applied_min_billable"]

    # 2. Volumetric dominates: 500g dead vs (50x40x30=12.0kg vol) -> 12.0 kg billable
    m2 = calculate_package_measurements(dead_weight_grams=500, length_cm=50, breadth_cm=40, height_cm=30)
    assert m2["dead_weight_kg"] == 0.5
    assert m2["volumetric_weight_kg"] == 12.0
    assert m2["billable_weight_kg"] == 12.0
    assert m2["is_volumetric"]
    assert not m2["applied_min_billable"]

    # 3. Minimum billable weight floor: 150g dead, no dims -> 0.5 kg billable
    m3 = calculate_package_measurements(dead_weight_grams=150)
    assert m3["dead_weight_kg"] == 0.15
    assert m3["volumetric_weight_kg"] == 0.0
    assert m3["billable_weight_kg"] == 0.5
    assert m3["applied_min_billable"]

    # 4. Packaging tare weight: 350g product + 150g tare = 500g (0.5kg)
    m4 = calculate_package_measurements(dead_weight_grams=350, packaging_tare_grams=150)
    assert m4["dead_weight_grams"] == 500
    assert m4["billable_weight_kg"] == 0.5


# -------------------------------------------------------------------------
# 3. Live Serviceability Query Tests
# -------------------------------------------------------------------------

def test_live_serviceability_success():
    """Verify live serviceability check succeeds when couriers are returned."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/external/courier/serviceability"
        assert request.url.params["pickup_postcode"] == "500090"
        assert request.url.params["delivery_postcode"] == "560001"
        assert request.url.params["weight"] == "0.50"
        assert request.url.params["cod"] == "0"
        return httpx.Response(
            200,
            json={
                "status": 200,
                "data": {
                    "available_courier_companies": [
                        {"courier_name": "Delhivery Surface", "courier_company_id": 1, "rate": 75.0}
                    ]
                },
            },
            request=request,
        )

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(email="test@example.com", password="pwd", http_client=mock_client)
    auth._mem_token = "valid_token"
    http = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)
    provider = ShiprocketProvider(auth_manager=auth, http_client=http)

    with patch.object(settings, "SHIPROCKET_MODE", "live"):
        assert provider.is_live is True
        is_serv = provider.check_serviceability("560001")
        assert is_serv is True


def test_live_serviceability_unserviceable_empty_couriers():
    """Verify live check returns False when available_courier_companies is empty."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"status": 200, "data": {"available_courier_companies": []}},
            request=request,
        )

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(email="test@example.com", password="pwd", http_client=mock_client)
    auth._mem_token = "valid_token"
    http = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)
    provider = ShiprocketProvider(auth_manager=auth, http_client=http)

    with patch.object(settings, "SHIPROCKET_MODE", "live"):
        assert provider.check_serviceability("999999") is False


def test_live_serviceability_unserviceable_404_422_response():
    """Verify live check gracefully returns False on 404/422 with unserviceable message."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            422,
            json={"message": "Delivery postcode is not serviceable by any courier"},
            request=request,
        )

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(email="test@example.com", password="pwd", http_client=mock_client)
    auth._mem_token = "valid_token"
    http = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)
    provider = ShiprocketProvider(auth_manager=auth, http_client=http)

    with patch.object(settings, "SHIPROCKET_MODE", "live"):
        assert provider.check_serviceability("123456") is False


def test_live_serviceability_server_error_raises_response_error():
    """Verify live check raises ShiprocketResponseError on 500 server error."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            500,
            json={"message": "Internal Server Error in Shiprocket"},
            request=request,
        )

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(email="test@example.com", password="pwd", http_client=mock_client)
    auth._mem_token = "valid_token"
    http = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)
    provider = ShiprocketProvider(auth_manager=auth, http_client=http)

    with patch.object(settings, "SHIPROCKET_MODE", "live"):
        with pytest.raises(ShiprocketResponseError):
            provider.check_serviceability("560001")


# -------------------------------------------------------------------------
# 4. Live Rate Calculation & Strategy Selection Tests
# -------------------------------------------------------------------------

MOCK_COURIERS_PAYLOAD = {
    "status": 200,
    "data": {
        "recommendation_courier_id": 2,
        "available_courier_companies": [
            {
                "courier_name": "Delhivery Surface",
                "courier_company_id": 1,
                "rate": 72.50,
                "estimated_delivery_days": "4-5 days",
            },
            {
                "courier_name": "BlueDart Express",
                "courier_company_id": 2,
                "rate": 115.00,
                "estimated_delivery_days": "1-2 days",
            },
            {
                "courier_name": "Shadowfax Standard",
                "courier_company_id": 3,
                "rate": 84.50,
                "estimated_delivery_days": "3-4 days",
            },
        ],
    },
}


def test_live_rate_strategy_cheapest():
    """Verify default 'cheapest' strategy selects lowest rate (Delhivery @ 72.50 = 7250 paise)."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=MOCK_COURIERS_PAYLOAD, request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(email="test@example.com", password="pwd", http_client=mock_client)
    auth._mem_token = "valid_token"
    http = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)
    provider = ShiprocketProvider(auth_manager=auth, http_client=http)

    with patch.object(settings, "SHIPROCKET_MODE", "live"):
        with patch.object(settings, "SHIPROCKET_COURIER_SELECTION_STRATEGY", "cheapest"):
            res = provider.calculate_rate_and_eta(
                origin_pincode="500090",
                destination_pincode="560001",
                weight_grams=600,
            )
            assert res["serviceable"] is True
            assert res["courier_name"] == "Delhivery Surface"
            assert res["rate_paise"] == 7250
            assert res["courier_company_id"] == 1
            assert len(res["available_couriers"]) == 3


def test_live_rate_strategy_recommended():
    """Verify 'recommended' strategy selects recommendation_courier_id (BlueDart @ 115.00 = 11500 paise)."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=MOCK_COURIERS_PAYLOAD, request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(email="test@example.com", password="pwd", http_client=mock_client)
    auth._mem_token = "valid_token"
    http = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)
    provider = ShiprocketProvider(auth_manager=auth, http_client=http)

    with patch.object(settings, "SHIPROCKET_MODE", "live"):
        with patch.object(settings, "SHIPROCKET_COURIER_SELECTION_STRATEGY", "recommended"):
            res = provider.calculate_rate_and_eta(
                origin_pincode="500090",
                destination_pincode="560001",
                weight_grams=600,
            )
            assert res["serviceable"] is True
            assert res["courier_name"] == "BlueDart Express"
            assert res["rate_paise"] == 11500
            assert res["courier_company_id"] == 2


def test_live_rate_strategy_fastest():
    """Verify 'fastest' strategy selects courier with lowest estimated delivery days (BlueDart: 1-2 days)."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=MOCK_COURIERS_PAYLOAD, request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(email="test@example.com", password="pwd", http_client=mock_client)
    auth._mem_token = "valid_token"
    http = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)
    provider = ShiprocketProvider(auth_manager=auth, http_client=http)

    with patch.object(settings, "SHIPROCKET_MODE", "live"):
        with patch.object(settings, "SHIPROCKET_COURIER_SELECTION_STRATEGY", "fastest"):
            res = provider.calculate_rate_and_eta(
                origin_pincode="500090",
                destination_pincode="560001",
                weight_grams=600,
            )
            assert res["serviceable"] is True
            assert res["courier_name"] == "BlueDart Express"
            assert res["eta_days_min"] == 1
            assert res["eta_days_max"] == 2


def test_decimal_paise_conversion_accuracy():
    """Verify Decimal multiplication avoids float precision errors (e.g. 84.50 -> exactly 8450)."""
    rate_val = 84.50
    rate_paise = int(round(Decimal(str(rate_val)) * 100))
    assert rate_paise == 8450

    rate_val2 = 103.25
    rate_paise2 = int(round(Decimal(str(rate_val2)) * 100))
    assert rate_paise2 == 10325


# -------------------------------------------------------------------------
# 5. API Endpoint Tests: 422 Unserviceable vs 503 Provider Outage
# -------------------------------------------------------------------------

def test_api_serviceability_endpoint_unserviceable_returns_200_false():
    """Verify GET /api/v1/shipping/serviceability returns 200 with serviceable=False for unserviceable PIN."""
    with patch.object(shiprocket_provider, "check_serviceability", return_value=False):
        resp = client.get("/api/v1/shipping/serviceability?pincode=999999")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["pincode"] == "999999"
        assert data["serviceable"] is False
        assert data["estimated_days_min"] == 0
        assert data["estimated_days_max"] == 0


def test_api_serviceability_endpoint_provider_error_returns_503():
    """Verify GET /api/v1/shipping/serviceability returns HTTP 503 on provider downtime."""
    with patch.object(
        shiprocket_provider,
        "check_serviceability",
        side_effect=ShiprocketConnectionError("Timeout connecting to Shiprocket"),
    ):
        resp = client.get(f"/api/v1/shipping/serviceability?pincode=560001&_t={uuid.uuid4().hex[:6]}")
        assert resp.status_code == 503
        data = resp.json()
        assert data["error"]["code"] == "SHIPPING_SERVICE_UNAVAILABLE"


def test_api_shipping_rates_provider_error_returns_503():
    """Verify POST /api/v1/shipping/rates returns HTTP 503 on provider downtime."""
    with patch.object(
        shiprocket_provider,
        "calculate_rate_and_eta",
        side_effect=ShiprocketResponseError("Shiprocket 503 Gateway Error"),
    ):
        resp = client.post(
            "/api/v1/shipping/rates",
            json={"destination_pincode": "560001", "weight_grams": 500},
        )
        assert resp.status_code == 503
        assert resp.json()["error"]["code"] == "SHIPPING_SERVICE_UNAVAILABLE"


# -------------------------------------------------------------------------
# 6. Address Service & Checkout Integration Tests
# -------------------------------------------------------------------------

def test_address_serialization_swallows_provider_outage():
    """Verify _serialize_address does not raise or falsely add unserviceable warning on provider failure."""
    mock_address = MagicMock(spec=Address)
    mock_address.id = uuid.uuid4()
    mock_address.recipient_name = "Jane Doe"
    mock_address.phone = "+919876543210"
    mock_address.line1 = "123 Main St"
    mock_address.line2 = None
    mock_address.city = "Bengaluru"
    mock_address.state = "Karnataka"
    mock_address.pincode = "560001"
    mock_address.country = "India"
    mock_address.is_default = True
    mock_address.created_at = None
    mock_address.updated_at = None

    with patch.object(
        shiprocket_provider,
        "check_serviceability",
        side_effect=ShiprocketConnectionError("Network down"),
    ):
        serialized = _serialize_address(mock_address, check_serviceability=True)
        assert serialized["pincode"] == "560001"
        assert serialized["serviceability_warning"] is None


def test_checkout_unserviceable_pin_returns_422(db):
    """Verify checkout session creation fails with HTTP 422 if address PIN is unserviceable."""
    user = User(
        id=uuid.uuid4(),
        email=f"chk_uns_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Checkout Unserviceable",
        is_active=True,
        status="verified",
    )
    db.add(user)
    db.commit()

    address = Address(
        id=uuid.uuid4(),
        user_id=user.id,
        recipient_name="Jane Doe",
        phone="+919876543210",
        line1="123 Remote Road",
        city="Remote",
        state="Ladakh",
        pincode="194101",
        country="India",
    )
    db.add(address)

    product = Product(
        id=uuid.uuid4(),
        name="IoT Sensor Board",
        slug=f"sensor-board-{uuid.uuid4().hex[:6]}",
        sku=f"SKU-IOT-{uuid.uuid4().hex[:4]}",
        status="active",
        price_paise=150000,
        weight_grams=300,
    )
    db.add(product)
    db.flush()

    inv = Inventory(product_id=product.id, stock_quantity=10, reserved_quantity=0)
    db.add(inv)

    cart = Cart(id=uuid.uuid4(), user_id=user.id)
    db.add(cart)
    db.flush()

    cart_item = CartItem(id=uuid.uuid4(), cart_id=cart.id, product_id=product.id, quantity=1)
    db.add(cart_item)
    db.commit()

    # Authoritative serviceability check returns False
    with patch.object(shiprocket_provider, "check_serviceability", return_value=False):
        with pytest.raises(Exception) as exc_info:
            create_checkout_session(db, user, str(address.id))
        err = exc_info.value
        assert getattr(err, "status_code", None) == 422
        assert getattr(err, "code", None) == "ADDRESS_UNSERVICEABLE"


def test_checkout_provider_outage_returns_503(db):
    """Verify checkout session creation fails with HTTP 503 if Shiprocket is unreachable."""
    user = User(
        id=uuid.uuid4(),
        email=f"chk_out_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Checkout Outage",
        is_active=True,
        status="verified",
    )
    db.add(user)

    address = Address(
        id=uuid.uuid4(),
        user_id=user.id,
        recipient_name="Jane Doe",
        phone="+919876543210",
        line1="123 High St",
        city="Hyderabad",
        state="Telangana",
        pincode="500081",
        country="India",
    )
    db.add(address)

    product = Product(
        id=uuid.uuid4(),
        name="Microcontroller",
        slug=f"mcu-{uuid.uuid4().hex[:6]}",
        sku=f"SKU-MCU-{uuid.uuid4().hex[:4]}",
        status="active",
        price_paise=200000,
        weight_grams=250,
    )
    db.add(product)
    db.flush()

    inv = Inventory(product_id=product.id, stock_quantity=10, reserved_quantity=0)
    db.add(inv)

    cart = Cart(id=uuid.uuid4(), user_id=user.id)
    db.add(cart)
    db.flush()

    cart_item = CartItem(id=uuid.uuid4(), cart_id=cart.id, product_id=product.id, quantity=1)
    db.add(cart_item)
    db.commit()

    with patch.object(
        shiprocket_provider,
        "check_serviceability",
        side_effect=ShiprocketConnectionError("Connection timed out to Shiprocket"),
    ):
        with pytest.raises(Exception) as exc_info:
            create_checkout_session(db, user, str(address.id))
        err = exc_info.value
        assert getattr(err, "status_code", None) == 503
        assert getattr(err, "code", None) == "SHIPPING_SERVICE_UNAVAILABLE"


def test_checkout_session_creation_and_address_change_recalculation(db):
    """Verify checkout session creation accurately integrates shipping rates and tax,
    and changing address recalculates shipping, tax, and preserves the reservation timer.
    """
    user = User(
        id=uuid.uuid4(),
        email=f"chk_calc_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Checkout Calc User",
        is_active=True,
        status="verified",
    )
    db.add(user)

    # Address 1: Intra-state (Telangana) -> CGST + SGST
    addr_ts = Address(
        id=uuid.uuid4(),
        user_id=user.id,
        recipient_name="John Telangana",
        phone="+919876543210",
        line1="123 Hitech City",
        city="Hyderabad",
        state="Telangana",
        pincode="500081",
        country="India",
    )
    db.add(addr_ts)

    # Address 2: Inter-state (Karnataka) -> IGST
    addr_ka = Address(
        id=uuid.uuid4(),
        user_id=user.id,
        recipient_name="John Karnataka",
        phone="+919876543210",
        line1="456 Indiranagar",
        city="Bengaluru",
        state="Karnataka",
        pincode="560038",
        country="India",
    )
    db.add(addr_ka)

    product = Product(
        id=uuid.uuid4(),
        name="Hardware Dev Kit",
        slug=f"devkit-{uuid.uuid4().hex[:6]}",
        sku=f"SKU-DEV-{uuid.uuid4().hex[:4]}",
        status="active",
        price_paise=100000,  # ₹1,000.00
        weight_grams=500,
    )
    db.add(product)
    db.flush()

    inv = Inventory(product_id=product.id, stock_quantity=5, reserved_quantity=0)
    db.add(inv)

    cart = Cart(id=uuid.uuid4(), user_id=user.id)
    db.add(cart)
    db.flush()

    cart_item = CartItem(id=uuid.uuid4(), cart_id=cart.id, product_id=product.id, quantity=1)
    db.add(cart_item)
    db.commit()

    # Create session with Telangana address (Intra-state)
    session_data = create_checkout_session(db, user, str(addr_ts.id))
    assert session_data["status"] == "open"
    orig_expires = session_data["reservation_expires_at"]
    assert orig_expires is not None

    # Check shipping and tax
    shipping_info = session_data["shipping"]
    assert float(shipping_info["rate"]) > 0
    tax_info = session_data["tax"]
    assert tax_info["type"] == "CGST+SGST"
    assert tax_info["cgst_amount"] is not None
    assert tax_info["sgst_amount"] is not None
    assert tax_info["igst_amount"] is None

    session_id = session_data["checkout_session_id"]

    # Now change address to Karnataka (Inter-state)
    updated_data = change_checkout_address(db, user, session_id, str(addr_ka.id))
    assert updated_data["checkout_session_id"] == session_id
    # Expiry timer must be preserved
    assert updated_data["reservation_expires_at"] == orig_expires
    # Tax must now be IGST
    updated_tax = updated_data["tax"]
    assert updated_tax["type"] == "IGST"
    assert updated_tax["igst_amount"] is not None
    assert updated_tax["cgst_amount"] is None
    assert updated_tax["sgst_amount"] is None


def test_simulation_mode_is_completely_deterministic():
    """Verify that in simulation mode, calculate_rate_and_eta executes deterministic formula."""
    provider = ShiprocketProvider()
    with patch.object(settings, "SHIPROCKET_MODE", "simulation"):
        assert provider.is_live is False
        res = provider.calculate_rate_and_eta(
            origin_pincode="500090",
            destination_pincode="500001",
            weight_grams=500,
        )
        assert res["serviceable"] is True
        assert res["rate_paise"] == 6000
        assert res["courier_name"] == "Standard Surface"

        # Unserviceable simulation PIN
        res_uns = provider.calculate_rate_and_eta(
            origin_pincode="500090",
            destination_pincode="999999",
            weight_grams=500,
        )
        assert res_uns["serviceable"] is False
        assert res_uns["rate_paise"] == 0
