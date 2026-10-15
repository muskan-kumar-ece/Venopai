"""Unit and integration tests for Shiprocket Phase 3:
- Live 2-step shipment booking (Order Creation + AWB Assignment)
- Delayed AWB fallback (awb_pending)
- Network timeout handling (reconciliation_required, HTTP 504)
- Provider 422 rejection handling (booking_failed, HTTP 422)
- Strict order eligibility (paid, processing, ready_to_ship allowed; cancelled/shipped/delivered rejected)
- Strict manufacturing eligibility (only completed_execution allowed; others rejected)
- No premature status advancement (Order stays ready_to_ship, MFG stays completed_execution)
- Concurrency and duplicate booking prevention (booking_in_progress, awb_assigned)
- Operational reconciliation endpoint and logic
- Explicit AWB assignment endpoint and logic
- Monotonic webhook updates and terminal state protection
- Webhook progression: ready_to_ship -> shipped -> delivered
- Simulation mode determinism preservation
"""
from datetime import datetime, timezone
from decimal import Decimal
import json
from unittest.mock import MagicMock, patch
import uuid
import pytest
import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.integrations.shiprocket.auth import ShiprocketAuthManager
from app.integrations.shiprocket.client import ShiprocketProvider, shiprocket_provider
from app.integrations.shiprocket.http_client import ShiprocketHttpClient
from app.integrations.shiprocket.exceptions import (
    ShiprocketError,
    ShiprocketResponseError,
    ShiprocketConnectionError,
)
from app.models.user import User, Address
from app.models.catalog import Product, Category
from app.models.order import Order, OrderItem, Shipment, ProcessedWebhookEvent
from app.models.project import ManufacturingRequest
from app.services.shipping import ShippingService
from app.core.security import get_password_hash, create_access_token
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
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def admin_user(db):
    u = db.query(User).filter(User.email == "admin_phase3@example.com").first()
    if not u:
        u = User(
            id=uuid.uuid4(),
            email="admin_phase3@example.com",
            hashed_password=get_password_hash("AdminPass123!"),
            full_name="Admin Phase3",
            role="SUPER_ADMIN",
            is_active=True,
            is_superuser=True,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


@pytest.fixture
def customer_user(db):
    u = db.query(User).filter(User.email == "customer_phase3@example.com").first()
    if not u:
        u = User(
            id=uuid.uuid4(),
            email="customer_phase3@example.com",
            hashed_password=get_password_hash("CustomerPass123!"),
            full_name="Customer Phase3",
            role="CUSTOMER",
            is_active=True,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


@pytest.fixture
def customer_address(db, customer_user):
    addr = db.query(Address).filter(Address.user_id == customer_user.id).first()
    if not addr:
        addr = Address(
            id=uuid.uuid4(),
            user_id=customer_user.id,
            recipient_name="John Customer",
            phone="9876543210",
            line1="123 Tech Park Road",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            country="IN",
            is_default=True,
        )
        db.add(addr)
        db.commit()
        db.refresh(addr)
    return addr


@pytest.fixture
def admin_headers(admin_user):
    token = create_access_token(
        subject=str(admin_user.id),
        role="SUPER_ADMIN",
        is_admin=True,
        audience="admin",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def sample_order(db, customer_user, customer_address):
    order = Order(
        id=uuid.uuid4(),
        order_number=f"ORD-P3-{uuid.uuid4().hex[:6].upper()}",
        user_id=customer_user.id,
        status="paid",
        subtotal_paise=100000,
        shipping_rate_paise=10000,
        tax_amount_paise=18000,
        total_paise=128000,
        shipping_address_id=customer_address.id,
        shipping_address_snapshot=json.dumps({
            "recipient_name": customer_address.recipient_name,
            "phone": customer_address.phone,
            "line1": customer_address.line1,
            "city": customer_address.city,
            "state": customer_address.state,
            "pincode": customer_address.pincode,
            "country": customer_address.country,
        }),
        created_at=datetime.now(timezone.utc),
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@pytest.fixture
def sample_mfg_request(db, customer_user):
    mfg = ManufacturingRequest(
        id=uuid.uuid4(),
        user_id=customer_user.id,
        title="IoT Telemetry Enclosure",
        project_overview="Custom ruggedized enclosure",
        prototype_type="3D_PRINTING",
        quantity=2,
        status="completed_execution",
        created_at=datetime.now(timezone.utc),
    )
    db.add(mfg)
    db.commit()
    db.refresh(mfg)
    return mfg


# -------------------------------------------------------------------------
# 1. Provider Unit Tests: 2-step booking, AWB assignment & reconciliation
# -------------------------------------------------------------------------

def test_provider_live_two_step_booking_success():
    """Verify provider creates adhoc order and then assigns AWB."""
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "/orders/create/adhoc" in url:
            return httpx.Response(200, json={
                "order_id": 998811,
                "shipment_id": 776655,
                "status": "NEW",
                "status_code": 1,
            }, request=request)
        if "/courier/assign/awb" in url:
            return httpx.Response(200, json={
                "response": {
                    "data": {
                        "awb_code": "DELIV_AWB_123456",
                        "courier_name": "Delhivery Air",
                        "courier_company_id": 10,
                        "awb_assign_status": 1,
                    }
                }
            }, request=request)
        return httpx.Response(404, json={}, request=request)

    auth = MagicMock()
    auth.get_valid_token.return_value = "token_valid"
    http_c = ShiprocketHttpClient(auth_manager=auth, transport=MockHttpTransport(handler))
    provider = ShiprocketProvider(http_client=http_c, mode="live")

    res = provider.create_shipment(
        reference_id="ORD-TEST-001",
        pickup_pincode="500001",
        delivery_pincode="560001",
        weight_grams=500,
    )

    assert res["shiprocket_order_id"] == "998811"
    assert res["shipment_id"] == "776655"
    assert res["tracking_number"] == "DELIV_AWB_123456"
    assert res["carrier"] == "Delhivery Air"
    assert res["booking_status"] == "awb_assigned"


def test_provider_live_booking_delayed_awb_fallback():
    """Verify that if AWB assignment fails or is delayed, booking succeeds as awb_pending."""
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "/orders/create/adhoc" in url:
            return httpx.Response(200, json={
                "order_id": 998822,
                "shipment_id": 776666,
                "status": "NEW",
            }, request=request)
        if "/courier/assign/awb" in url:
            return httpx.Response(200, json={
                "response": {
                    "data": {
                        "awb_code": "",
                        "awb_assign_status": 0,
                    }
                }
            }, request=request)
        return httpx.Response(404, json={}, request=request)

    auth = MagicMock()
    auth.get_valid_token.return_value = "token_valid"
    http_c = ShiprocketHttpClient(auth_manager=auth, transport=MockHttpTransport(handler))
    provider = ShiprocketProvider(http_client=http_c, mode="live")

    res = provider.create_shipment(
        reference_id="ORD-TEST-002",
        pickup_pincode="500001",
        delivery_pincode="560001",
        weight_grams=500,
    )

    assert res["shiprocket_order_id"] == "998822"
    assert res["shipment_id"] == "776666"
    assert res["tracking_number"] is None
    assert res["booking_status"] == "awb_pending"


def test_provider_live_booking_rejection():
    """Verify provider 422 raises sanitized ShiprocketResponseError."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(422, json={
            "message": "Invalid delivery pincode 999999",
            "errors": {"delivery_pincode": ["Unserviceable"]},
        }, request=request)

    auth = MagicMock()
    auth.get_valid_token.return_value = "token_valid"
    http_c = ShiprocketHttpClient(auth_manager=auth, transport=MockHttpTransport(handler))
    provider = ShiprocketProvider(http_client=http_c, mode="live")

    with pytest.raises(ShiprocketResponseError) as exc_info:
        provider.create_shipment(
            reference_id="ORD-TEST-003",
            pickup_pincode="500001",
            delivery_pincode="999999",
            weight_grams=500,
        )
    assert "Invalid delivery pincode" in str(exc_info.value)


def test_provider_order_details_for_reconciliation():
    """Verify remote order lookup returns shipment and AWB information."""
    def handler(request: httpx.Request) -> httpx.Response:
        if "/orders/show/998811" in str(request.url):
            return httpx.Response(200, json={
                "data": {
                    "id": 998811,
                    "channel_order_id": "ORD-TEST-001",
                    "status": "AWB ASSIGNED",
                    "shipments": [
                        {
                            "id": 776655,
                            "awb": "DELIV_AWB_RECON_999",
                            "courier_name": "Delhivery Surface",
                            "status": "AWB_ASSIGNED",
                        }
                    ]
                }
            }, request=request)
        return httpx.Response(404, json={}, request=request)

    auth = MagicMock()
    auth.get_valid_token.return_value = "token_valid"
    http_c = ShiprocketHttpClient(auth_manager=auth, transport=MockHttpTransport(handler))
    provider = ShiprocketProvider(http_client=http_c, mode="live")

    details = provider.get_order_details("998811")
    assert details["id"] == 998811
    assert len(details["shipments"]) == 1
    assert details["shipments"][0]["awb"] == "DELIV_AWB_RECON_999"


# -------------------------------------------------------------------------
# 2. ShippingService Order Shipment Creation & Eligibility
# -------------------------------------------------------------------------

def test_order_shipment_successful_booking(db, admin_user, sample_order):
    """Test full booking lifecycle: intent persisted, external API called outside DB, order set to ready_to_ship."""
    with patch("app.services.shipping.shiprocket_provider.create_shipment") as mock_create:
        mock_create.return_value = {
            "shiprocket_order_id": "SR_ORD_771",
            "shipment_id": "SR_SHIP_771",
            "tracking_number": "AWB_TEST_771",
            "carrier": "Blue Dart",
            "courier_company_id": 2,
            "booking_status": "awb_assigned",
        }

        shipment = ShippingService.create_order_shipment(
            db=db,
            admin_user=admin_user,
            order_id=str(sample_order.id),
            data={"weight_grams": 600},
        )

        assert shipment.booking_status == "awb_assigned"
        assert shipment.tracking_number == "AWB_TEST_771"
        assert shipment.shiprocket_order_id == "SR_ORD_771"
        assert shipment.carrier == "Blue Dart"

        db.refresh(sample_order)
        assert sample_order.status == "ready_to_ship"


def test_order_shipment_ineligible_order_status(db, admin_user, sample_order):
    """Order with status cancelled or shipped must be rejected with 409 Conflict."""
    sample_order.status = "cancelled"
    db.commit()

    with pytest.raises(Exception) as exc_info:
        ShippingService.create_order_shipment(
            db=db,
            admin_user=admin_user,
            order_id=str(sample_order.id),
            data={},
        )
    assert exc_info.value.status_code == 409
    assert "not eligible" in str(exc_info.value.message).lower()


def test_order_shipment_duplicate_prevention(db, admin_user, sample_order):
    """If a booking has already completed (awb_assigned), duplicate request returns existing shipment."""
    s = Shipment(
        id=uuid.uuid4(),
        order_id=sample_order.id,
        tracking_number="AWB_EXISTING_111",
        booking_status="awb_assigned",
        status="created",
    )
    db.add(s)
    db.commit()

    res = ShippingService.create_order_shipment(
        db=db,
        admin_user=admin_user,
        order_id=str(sample_order.id),
        data={},
    )
    assert res.id == s.id
    assert res.tracking_number == "AWB_EXISTING_111"


def test_order_shipment_timeout_reconciliation_required(db, admin_user, sample_order):
    """Network timeout during booking must mark shipment as reconciliation_required and raise 504."""
    with patch("app.services.shipping.shiprocket_provider.create_shipment") as mock_create:
        mock_create.side_effect = ShiprocketConnectionError("Connection to Shiprocket timed out after 15s")

        with pytest.raises(Exception) as exc_info:
            ShippingService.create_order_shipment(
                db=db,
                admin_user=admin_user,
                order_id=str(sample_order.id),
                data={},
            )
        assert exc_info.value.status_code == 504

        shipment = db.query(Shipment).filter(Shipment.order_id == sample_order.id).first()
        assert shipment is not None
        assert shipment.booking_status == "reconciliation_required"
        assert "timed out" in shipment.last_booking_error.lower()


# -------------------------------------------------------------------------
# 3. Manufacturing Deliverable Shipment Creation & Eligibility
# -------------------------------------------------------------------------

def test_manufacturing_shipment_successful_booking(db, admin_user, sample_mfg_request):
    """Manufacturing request in completed_execution creates shipment; status remains completed_execution."""
    with patch("app.services.shipping.shiprocket_provider.create_shipment") as mock_create:
        mock_create.return_value = {
            "shiprocket_order_id": "SR_MFG_ORD_101",
            "shipment_id": "SR_MFG_SHIP_101",
            "tracking_number": "AWB_MFG_101",
            "carrier": "Delhivery Surface",
            "booking_status": "awb_assigned",
        }

        shipment = ShippingService.create_manufacturing_shipment(
            db=db,
            admin_user=admin_user,
            mfg_id=str(sample_mfg_request.id),
            data={"weight_grams": 750},
        )

        assert shipment.booking_status == "awb_assigned"
        assert shipment.tracking_number == "AWB_MFG_101"

        db.refresh(sample_mfg_request)
        assert sample_mfg_request.status == "completed_execution"


def test_manufacturing_shipment_ineligible_status(db, admin_user, sample_mfg_request):
    """Manufacturing request not in completed_execution must be rejected with 409 Conflict."""
    sample_mfg_request.status = "in_progress"
    db.commit()

    with pytest.raises(Exception) as exc_info:
        ShippingService.create_manufacturing_shipment(
            db=db,
            admin_user=admin_user,
            mfg_id=str(sample_mfg_request.id),
            data={},
        )
    assert exc_info.value.status_code == 409
    assert "completed_execution" in str(exc_info.value.message)


# -------------------------------------------------------------------------
# 4. Reconciliation and Explicit AWB Assignment
# -------------------------------------------------------------------------

def test_reconcile_shipment_recovers_awb(db, admin_user, sample_order):
    """Reconciliation retrieves existing remote order and assigns AWB."""
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=sample_order.id,
        shiprocket_order_id="998811",
        booking_status="reconciliation_required",
        status="pending",
    )
    db.add(shipment)
    db.commit()

    with patch("app.services.shipping.shiprocket_provider.get_order_details") as mock_details:
        mock_details.return_value = {
            "id": 998811,
            "shipments": [
                {
                    "id": 776655,
                    "awb": "RECON_AWB_CONFIRMED",
                    "courier_name": "Delhivery",
                }
            ]
        }

        reconciled = ShippingService.reconcile_shipment(
            db=db,
            shipment_id=str(shipment.id),
            admin_user=admin_user,
        )

        assert reconciled.booking_status == "awb_assigned"
        assert reconciled.tracking_number == "RECON_AWB_CONFIRMED"
        assert reconciled.status == "created"
        assert "Successfully reconciled" in reconciled.reconciliation_notes


def test_explicit_assign_awb_success(db, admin_user, sample_order):
    """Explicit AWB assignment turns awb_pending into awb_assigned."""
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=sample_order.id,
        shiprocket_order_id="998811",
        shiprocket_shipment_id="776655",
        booking_status="awb_pending",
        status="pending",
    )
    db.add(shipment)
    db.commit()

    with patch("app.services.shipping.shiprocket_provider.assign_awb") as mock_assign:
        mock_assign.return_value = {
            "awb_code": "ASSIGNED_AWB_777",
            "courier_name": "Delhivery",
            "courier_company_id": 10,
        }

        updated = ShippingService.assign_shipment_awb(
            db=db,
            shipment_id=str(shipment.id),
            courier_id=10,
            admin_user=admin_user,
        )

        assert updated.booking_status == "awb_assigned"
        assert updated.tracking_number == "ASSIGNED_AWB_777"
        assert updated.courier_company_id == 10


# -------------------------------------------------------------------------
# 5. Webhook Monotonic Transitions & Terminal Protection
# -------------------------------------------------------------------------

def test_webhook_monotonic_order_advancement(db, customer_user, sample_order):
    """In-transit webhook advances order from ready_to_ship to shipped; delivered advances to delivered."""
    sample_order.status = "ready_to_ship"
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=sample_order.id,
        tracking_number="TRACK_FLOW_123",
        carrier="Delhivery",
        booking_status="awb_assigned",
        status="created",
    )
    db.add(shipment)
    db.commit()

    headers = {"X-Shiprocket-Token": settings.SHIPROCKET_WEBHOOK_TOKEN}
    payload_pickup = {
        "event_id": f"evt_p_{uuid.uuid4().hex[:6]}",
        "awb": "TRACK_FLOW_123",
        "current_status": "IN TRANSIT",
    }
    resp1 = client.post("/api/v1/webhooks/shiprocket", json=payload_pickup, headers=headers)
    assert resp1.status_code == 200

    db.refresh(shipment)
    db.refresh(sample_order)
    assert shipment.status == "in_transit"
    assert sample_order.status == "shipped"

    payload_delivered = {
        "event_id": f"evt_d_{uuid.uuid4().hex[:6]}",
        "awb": "TRACK_FLOW_123",
        "current_status": "DELIVERED",
    }
    resp2 = client.post("/api/v1/webhooks/shiprocket", json=payload_delivered, headers=headers)
    assert resp2.status_code == 200

    db.refresh(shipment)
    db.refresh(sample_order)
    assert shipment.status == "delivered"
    assert sample_order.status == "delivered"


def test_webhook_terminal_state_protection(db, sample_order):
    """Out-of-order in-transit event arriving after delivery does not regress shipment or order."""
    sample_order.status = "delivered"
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=sample_order.id,
        tracking_number="TERMINAL_TRACK_999",
        carrier="Delhivery",
        booking_status="awb_assigned",
        status="delivered",
    )
    db.add(shipment)
    db.commit()

    headers = {"X-Shiprocket-Token": settings.SHIPROCKET_WEBHOOK_TOKEN}
    delayed_payload = {
        "event_id": f"evt_delayed_{uuid.uuid4().hex[:6]}",
        "awb": "TERMINAL_TRACK_999",
        "current_status": "IN TRANSIT",
    }
    resp = client.post("/api/v1/webhooks/shiprocket", json=delayed_payload, headers=headers)
    assert resp.status_code == 200

    db.refresh(shipment)
    db.refresh(sample_order)
    assert shipment.status == "delivered"
    assert sample_order.status == "delivered"


# -------------------------------------------------------------------------
# 6. Admin API Endpoints
# -------------------------------------------------------------------------

def test_admin_order_shipment_api(db, admin_headers, sample_order):
    """POST /api/v1/admin/orders/{id}/shipment successfully dispatches shipment."""
    with patch("app.services.shipping.shiprocket_provider.create_shipment") as mock_create:
        mock_create.return_value = {
            "shiprocket_order_id": "SR_API_900",
            "shipment_id": "SR_API_SHIP_900",
            "tracking_number": "API_AWB_900",
            "carrier": "Blue Dart",
            "booking_status": "awb_assigned",
        }

        resp = client.post(
            f"/api/v1/admin/orders/{sample_order.id}/shipment",
            json={"weight_grams": 500, "carrier": "Blue Dart"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["tracking_number"] == "API_AWB_900"
        assert data["booking_status"] == "awb_assigned"


def test_admin_manufacturing_shipment_api(db, admin_headers, sample_mfg_request):
    """POST /api/v1/admin/manufacturing/{id}/shipment dispatches completed deliverable."""
    with patch("app.services.shipping.shiprocket_provider.create_shipment") as mock_create:
        mock_create.return_value = {
            "shiprocket_order_id": "SR_MFG_API_901",
            "shipment_id": "SR_MFG_SHIP_901",
            "tracking_number": "MFG_API_AWB_901",
            "carrier": "Delhivery",
            "booking_status": "awb_assigned",
        }

        resp = client.post(
            f"/api/v1/admin/manufacturing/{sample_mfg_request.id}/shipment",
            json={"weight_grams": 1000},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["tracking_number"] == "MFG_API_AWB_901"
        assert data["booking_status"] == "awb_assigned"


def test_admin_reconcile_shipment_api(db, admin_headers, sample_order):
    """POST /api/v1/admin/shipping/{id}/reconcile calls reconciliation endpoint."""
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=sample_order.id,
        shiprocket_order_id="998811",
        booking_status="reconciliation_required",
        status="pending",
    )
    db.add(shipment)
    db.commit()

    with patch("app.services.shipping.shiprocket_provider.get_order_details") as mock_details:
        mock_details.return_value = {
            "id": 998811,
            "shipments": [{"id": 776655, "awb": "RECON_API_AWB", "courier_name": "Delhivery"}]
        }

        resp = client.post(
            f"/api/v1/admin/shipping/{shipment.id}/reconcile",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["booking_status"] == "awb_assigned"
        assert data["tracking_number"] == "RECON_API_AWB"


# -------------------------------------------------------------------------
# 7. Simulation Mode Determinism
# -------------------------------------------------------------------------

def test_simulation_mode_creates_deterministic_shipment():
    """Verify simulation mode operates offline with deterministic output."""
    provider = ShiprocketProvider(http_client=None, mode="simulation")
    res = provider.create_shipment(
        reference_id="SIM-ORDER-999",
        pickup_pincode="500001",
        delivery_pincode="560001",
        weight_grams=500,
    )

    assert res["shiprocket_order_id"] == "sr_SIMORDER"
    assert res["tracking_number"] == "AWBSIMORDER"
    assert res["booking_status"] == "awb_assigned"
    assert res["carrier"] == "Delhivery"
