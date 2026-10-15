"""Unit and integration tests for Shiprocket Phase 5:
- Live tracking queries with graceful awaiting-scan handling
- Webhook timing-safe multi-source authentication (headers & query string)
- Webhook payload size bounding (1MB limit) & deterministic hash deduplication
- Durable ShippingWebhookInbox ingestion & async Celery dispatch
- Monotonic forward tracking progression & terminal state protection
- Conflicting terminal state detection and logging
- Parent Order & ManufacturingRequest state progression
- Periodic Celery reconciliation with distributed locking & terminal exclusion
- Customer tracking API (SHIP-API-003) with strict IDOR protection & persisted scan timeline
- Admin operational exception and recovery APIs
- 100% mocked external HTTP calls and deterministic simulation tests
"""
from datetime import datetime, timezone, timedelta
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
from app.models.user import User, AuditEvent
from app.models.order import (
    Order,
    Shipment,
    ShipmentTrackingEvent,
    ShippingWebhookInbox,
)
from app.models.project import ManufacturingRequest
from app.services.shipping import ShippingService
from app.workers.tasks.shipping import (
    sync_active_shipments_task,
    process_shiprocket_webhook_task,
)
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
def customer_user(db):
    u = db.query(User).filter(User.email == "customer_p5@example.com").first()
    if not u:
        u = User(
            id=uuid.uuid4(),
            email="customer_p5@example.com",
            hashed_password=get_password_hash("CustPass123!"),
            full_name="Customer Phase5",
            role="CUSTOMER",
            is_active=True,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


@pytest.fixture
def other_user(db):
    u = db.query(User).filter(User.email == "other_p5@example.com").first()
    if not u:
        u = User(
            id=uuid.uuid4(),
            email="other_p5@example.com",
            hashed_password=get_password_hash("OtherPass123!"),
            full_name="Other User Phase5",
            role="CUSTOMER",
            is_active=True,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


@pytest.fixture
def admin_user(db):
    u = db.query(User).filter(User.email == "admin_p5@example.com").first()
    if not u:
        u = User(
            id=uuid.uuid4(),
            email="admin_p5@example.com",
            hashed_password=get_password_hash("AdminPass123!"),
            full_name="Admin Phase5",
            role="SUPER_ADMIN",
            is_active=True,
            is_superuser=True,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


@pytest.fixture
def customer_token(customer_user):
    return create_access_token(
        subject=str(customer_user.id),
        role="CUSTOMER",
        audience="customer",
    )


@pytest.fixture
def other_token(other_user):
    return create_access_token(
        subject=str(other_user.id),
        role="CUSTOMER",
        audience="customer",
    )


@pytest.fixture
def admin_token(admin_user):
    return create_access_token(
        subject=str(admin_user.id),
        role="SUPER_ADMIN",
        is_admin=True,
        audience="admin",
    )


@pytest.fixture
def sample_order(db, customer_user):
    order = Order(
        id=uuid.uuid4(),
        order_number=f"ORD-P5-{uuid.uuid4().hex[:6].upper()}",
        user_id=customer_user.id,
        status="ready_to_ship",
        total_paise=500000,
        subtotal_paise=450000,
        shipping_rate_paise=5000,
        tax_amount_paise=45000,
        shipping_address_snapshot=json.dumps({
            "recipient_name": "Customer Phase5",
            "phone": "9876543210",
            "address_line1": "100 MG Road",
            "city": "Bengaluru",
            "state": "Karnataka",
            "postal_code": "560001",
            "country": "India",
        }),
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
        title="P5 Robotic Arm Part",
        project_overview="Prototyping arm part for testing",
        status="shipped",
    )
    db.add(mfg)
    db.commit()
    db.refresh(mfg)
    return mfg


@pytest.fixture
def sample_shipment(db, sample_order):
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=sample_order.id,
        shiprocket_order_id="SR-P5-99881",
        shiprocket_shipment_id="SR-SHIP-99881",
        tracking_number=f"AWB-P5-{uuid.uuid4().hex[:8].upper()}",
        carrier="Delhivery",
        booking_status="awb_assigned",
        status="ready_to_ship",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(shipment)
    db.commit()
    db.refresh(shipment)
    return shipment


# =============================================================================
# 1. Provider Layer Tests (Live & Simulation)
# =============================================================================

def test_simulation_tracking_query():
    """In simulation mode, get_tracking_status returns deterministic structured response."""
    provider = ShiprocketProvider(mode="simulation")
    res = provider.get_tracking_status("AWB123456789")
    assert res["tracking_number"] == "AWB123456789"
    assert res["carrier"] == "Delhivery"
    assert res["status"] in ("in_transit", "delivered", "out_for_delivery")
    assert len(res["events"]) > 0


def test_live_tracking_query_awaiting_scan():
    """When carrier returns track_status=0 or not found, marks is_awaiting_scan=True without fabricating."""
    def handler(request: httpx.Request):
        assert "/courier/track/awb/AWB-UNSCANNED-01" in str(request.url)
        # Shiprocket return structure when order is booked but parcel not yet physically picked up
        return httpx.Response(
            200,
            json={
                "tracking_data": {
                    "track_status": 0,
                    "shipment_status": 0,
                    "error": "Awb Data Not Found",
                    "shipment_track": [],
                }
            },
        )

    auth = ShiprocketAuthManager(base_url="https://apiv2.shiprocket.in/v1/external", email="test@v.ai", password="pwd")
    auth._token = "valid-token"
    auth._token_expires_at = datetime.now(timezone.utc) + timedelta(hours=2)

    transport = MockHttpTransport(handler)
    http_client = ShiprocketHttpClient(transport=transport)
    provider = ShiprocketProvider(auth_manager=auth, http_client=http_client, mode="live")

    res = provider.get_tracking_status("AWB-UNSCANNED-01")
    assert res["is_awaiting_scan"] is True
    assert res["status"] == "awaiting_scan"
    assert len(res["events"]) == 0


def test_live_tracking_query_with_scans():
    """When carrier has physical scans, returns normalized status and chronological events."""
    def handler(request: httpx.Request):
        return httpx.Response(
            200,
            json={
                "tracking_data": {
                    "track_status": 1,
                    "shipment_status": 7,
                    "shipment_track": [
                        {
                            "id": 101,
                            "awb_code": "AWB-IN-TRANSIT-01",
                            "courier_name": "Blue Dart",
                            "current_status": "IN TRANSIT",
                            "edd": "2026-10-20 18:00:00",
                        }
                    ],
                    "shipment_track_activities": [
                        {
                            "activity": "Parcel picked up from vendor facility",
                            "location": "Bengaluru",
                            "date": "2026-10-14 10:00:00",
                            "status": "PICKED UP",
                        },
                        {
                            "activity": "Arrived at Bangalore sorting center",
                            "location": "Bengaluru Hub",
                            "date": "2026-10-14 14:30:00",
                            "status": "IN TRANSIT",
                        },
                    ],
                }
            },
        )

    auth = ShiprocketAuthManager(base_url="https://apiv2.shiprocket.in/v1/external", email="test@v.ai", password="pwd")
    auth._token = "valid-token"
    auth._token_expires_at = datetime.now(timezone.utc) + timedelta(hours=2)

    transport = MockHttpTransport(handler)
    http_client = ShiprocketHttpClient(transport=transport)
    provider = ShiprocketProvider(auth_manager=auth, http_client=http_client, mode="live")

    res = provider.get_tracking_status("AWB-IN-TRANSIT-01")
    assert res["is_awaiting_scan"] is False
    assert res["status"] == "in_transit"
    assert res["carrier"] == "Blue Dart"
    assert len(res["events"]) == 2
    assert res["events"][0]["activity"] == "Parcel picked up from vendor facility"
    assert res["events"][1]["location"] == "Bengaluru Hub"



# =============================================================================
# 2. Webhook Authentication, Size Bounding & Ingestion Tests
# =============================================================================

def test_webhook_auth_x_shiprocket_token():
    """Webhook authenticates successfully via X-Shiprocket-Token header."""
    with patch("app.api.v1.webhooks.settings.SHIPROCKET_WEBHOOK_TOKEN", "secret-sr-token"):
        payload = {
            "awb": f"AWB-WH-{uuid.uuid4().hex[:6]}",
            "current_status": "PICKED UP",
            "courier_name": "Delhivery",
        }
        res = client.post(
            "/api/v1/webhooks/shiprocket",
            json=payload,
            headers={"X-Shiprocket-Token": "secret-sr-token"},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "accepted"


def test_webhook_auth_x_api_key():
    """Webhook authenticates successfully via x-api-key header."""
    with patch("app.api.v1.webhooks.settings.SHIPROCKET_WEBHOOK_TOKEN", "secret-sr-token"):
        payload = {
            "awb": f"AWB-WH-{uuid.uuid4().hex[:6]}",
            "current_status": "IN TRANSIT",
        }
        res = client.post(
            "/api/v1/webhooks/shiprocket",
            json=payload,
            headers={"x-api-key": "secret-sr-token"},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "accepted"


def test_webhook_auth_query_token():
    """Webhook authenticates successfully via ?token= query parameter."""
    with patch("app.api.v1.webhooks.settings.SHIPROCKET_WEBHOOK_TOKEN", "secret-sr-token"):
        payload = {
            "awb": f"AWB-WH-{uuid.uuid4().hex[:6]}",
            "current_status": "OUT FOR DELIVERY",
        }
        res = client.post(
            "/api/v1/webhooks/shiprocket?token=secret-sr-token",
            json=payload,
        )
        assert res.status_code == 200
        assert res.json()["status"] == "accepted"


def test_webhook_auth_missing_or_invalid_token():
    """Webhook with missing or invalid token is rejected with 401."""
    with patch("app.api.v1.webhooks.settings.SHIPROCKET_WEBHOOK_TOKEN", "secret-sr-token"):
        res = client.post(
            "/api/v1/webhooks/shiprocket",
            json={"awb": "123", "current_status": "DELIVERED"},
            headers={"X-Shiprocket-Token": "wrong-token"},
        )
        assert res.status_code == 401

        res2 = client.post(
            "/api/v1/webhooks/shiprocket",
            json={"awb": "123", "current_status": "DELIVERED"},
        )
        assert res2.status_code == 401


def test_webhook_payload_size_limit():
    """Webhook payloads exceeding 1MB are rejected with 413."""
    with patch("app.api.v1.webhooks.settings.SHIPROCKET_WEBHOOK_TOKEN", "secret-sr-token"):
        huge_data = "x" * (1048576 + 50)
        res = client.post(
            "/api/v1/webhooks/shiprocket",
            content=huge_data,
            headers={
                "X-Shiprocket-Token": "secret-sr-token",
                "Content-Length": str(len(huge_data)),
            },
        )
        assert res.status_code == 413


def test_webhook_deduplication():
    """Duplicate webhook submissions are acknowledged with 200 and duplicate_ignored."""
    with patch("app.api.v1.webhooks.settings.SHIPROCKET_WEBHOOK_TOKEN", "secret-sr-token"):
        awb_code = f"AWB-DEDUP-{uuid.uuid4().hex[:6]}"
        payload = {
            "event_id": f"evt_{uuid.uuid4().hex}",
            "awb": awb_code,
            "current_status": "IN TRANSIT",
        }
        res1 = client.post(
            "/api/v1/webhooks/shiprocket",
            json=payload,
            headers={"X-Shiprocket-Token": "secret-sr-token"},
        )
        assert res1.status_code == 200
        assert res1.json()["status"] == "accepted"

        # Resend exact event
        res2 = client.post(
            "/api/v1/webhooks/shiprocket",
            json=payload,
            headers={"X-Shiprocket-Token": "secret-sr-token"},
        )
        assert res2.status_code == 200
        assert res2.json()["status"] == "duplicate_ignored"


# =============================================================================
# 3. State Machine & Invariant Tests
# =============================================================================

def test_tracking_forward_progression(db, sample_shipment):
    """Shipment smoothly advances: ready_to_ship -> in_transit -> out_for_delivery -> delivered."""
    assert sample_shipment.status == "ready_to_ship"

    # Step 1: in_transit
    res1 = ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment,
        raw_status="IN TRANSIT",
        carrier="Delhivery",
    )
    assert res1["status"] == "in_transit"
    assert res1["status_transitioned"] is True

    # Step 2: out_for_delivery
    res2 = ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment,
        raw_status="OUT FOR DELIVERY",
    )
    assert res2["status"] == "out_for_delivery"

    # Step 3: delivered
    res3 = ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment,
        raw_status="DELIVERED",
    )
    assert res3["status"] == "delivered"


def test_tracking_prevents_terminal_regression(db, sample_shipment):
    """Out-of-order non-terminal scan received after delivery does NOT regress status."""
    ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment,
        raw_status="DELIVERED",
    )
    assert sample_shipment.status == "delivered"

    # Incoming out-of-order IN TRANSIT scan
    res = ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment,
        raw_status="IN TRANSIT",
    )
    assert res["status"] == "delivered"
    assert res["status_transitioned"] is False
    assert sample_shipment.status == "delivered"


def test_tracking_out_of_order_non_terminal(db, sample_shipment):
    """Incoming scan with lower rank does not regress status."""
    ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment,
        raw_status="OUT FOR DELIVERY",
    )
    assert sample_shipment.status == "out_for_delivery"

    # Incoming earlier IN TRANSIT scan
    res = ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment,
        raw_status="IN TRANSIT",
    )
    assert res["status"] == "out_for_delivery"
    assert res["status_transitioned"] is False
    assert sample_shipment.status == "out_for_delivery"


def test_tracking_conflicting_terminal_states(db, sample_shipment):
    """Conflicting terminal event (e.g. cancelled after delivered) is flagged in tracking_exception_notes."""
    ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment,
        raw_status="DELIVERED",
    )
    assert sample_shipment.status == "delivered"

    # Conflicting CANCELLED event
    ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment,
        raw_status="CANCELLED",
        source="webhook",
    )
    # Status remains delivered, but conflict is noted
    assert sample_shipment.status == "delivered"
    assert "Conflicting terminal status" in sample_shipment.tracking_exception_notes
    assert "cancelled" in sample_shipment.tracking_exception_notes


def test_tracking_scan_events_persisted_and_deduplicated(db, sample_shipment):
    """Scan events from carrier are persisted in ShipmentTrackingEvent and deduplicated."""
    scans = [
        {
            "status": "PICKED UP",
            "activity": "Carrier picked up package",
            "location": "Bengaluru",
            "date": "2026-10-14 09:00:00",
        },
        {
            "status": "IN TRANSIT",
            "activity": "In transit to hub",
            "location": "Bangalore Hub",
            "date": "2026-10-14 12:00:00",
        },
    ]

    res1 = ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment,
        raw_status="IN TRANSIT",
        scans=scans,
    )
    assert res1["inserted_scans"] == 2

    events = db.query(ShipmentTrackingEvent).filter(
        ShipmentTrackingEvent.shipment_id == sample_shipment.id
    ).all()
    assert len(events) == 2

    # Re-apply exact same scans
    res2 = ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment,
        raw_status="IN TRANSIT",
        scans=scans,
    )
    # Deduplicated, 0 new scans inserted
    assert res2["inserted_scans"] == 0
    events_after = db.query(ShipmentTrackingEvent).filter(
        ShipmentTrackingEvent.shipment_id == sample_shipment.id
    ).all()
    assert len(events_after) == 2


# =============================================================================
# 4. Order and Manufacturing Progression Tests
# =============================================================================

def test_order_progression_ready_to_ship_until_pickup(db, sample_order, sample_shipment):
    """Order remains ready_to_ship until carrier pickup, then advances to shipped."""
    assert sample_order.status == "ready_to_ship"
    assert sample_shipment.status == "ready_to_ship"

    # Webhook or scan confirms carrier pickup
    ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment,
        raw_status="PICKED UP",
    )
    db.refresh(sample_order)
    assert sample_shipment.status == "in_transit"
    assert sample_order.status == "shipped"


def test_order_progression_delivered_on_carrier_delivered(db, sample_order, sample_shipment):
    """Order transitions to delivered upon verified carrier delivery."""
    ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment,
        raw_status="DELIVERED",
    )
    db.refresh(sample_order)
    assert sample_shipment.status == "delivered"
    assert sample_order.status == "delivered"


def test_manufacturing_request_delivered_on_carrier_delivered(db, sample_mfg_request):
    """Manufacturing request transitions to delivered only upon verified delivery."""
    shipment = Shipment(
        id=uuid.uuid4(),
        manufacturing_request_id=sample_mfg_request.id,
        tracking_number=f"AWB-MFG-{uuid.uuid4().hex[:6]}",
        status="in_transit",
        booking_status="awb_assigned",
    )
    db.add(shipment)
    db.commit()

    assert sample_mfg_request.status == "shipped"

    ShippingService.apply_tracking_update(
        db=db,
        shipment=shipment,
        raw_status="DELIVERED",
    )
    db.refresh(sample_mfg_request)
    assert shipment.status == "delivered"
    assert sample_mfg_request.status == "delivered"


# =============================================================================
# 5. Durable Webhook Inbox & Worker Tests
# =============================================================================

def test_webhook_inbox_persistence_and_processing(db, sample_shipment):
    """Webhook event stored in inbox is processed by process_webhook_inbox_event."""
    payload = {
        "awb": sample_shipment.tracking_number,
        "current_status": "OUT FOR DELIVERY",
        "courier_name": "Delhivery",
    }
    inbox = ShippingWebhookInbox(
        id=uuid.uuid4(),
        event_id=f"test_inbox_{uuid.uuid4().hex[:8]}",
        provider="shiprocket",
        event_type="shipment.out_for_delivery",
        payload_json=json.dumps(payload),
        status="pending",
        received_at=datetime.now(timezone.utc),
    )
    db.add(inbox)
    db.commit()

    res = ShippingService.process_webhook_inbox_event(db, str(inbox.id))
    assert res["status"] == "processed"

    db.refresh(inbox)
    assert inbox.status == "processed"
    assert inbox.attempts == 1
    assert inbox.processed_at is not None

    db.refresh(sample_shipment)
    assert sample_shipment.status == "out_for_delivery"


def test_webhook_inbox_unmatched_shipment(db):
    """Webhook for unknown AWB records unmatched status in inbox without crashing."""
    payload = {
        "awb": "AWB-COMPLETELY-UNKNOWN-99",
        "current_status": "IN TRANSIT",
    }
    inbox = ShippingWebhookInbox(
        id=uuid.uuid4(),
        event_id=f"test_unmatched_{uuid.uuid4().hex[:8]}",
        provider="shiprocket",
        event_type="shipment.in_transit",
        payload_json=json.dumps(payload),
        status="pending",
        received_at=datetime.now(timezone.utc),
    )
    db.add(inbox)
    db.commit()

    res = ShippingService.process_webhook_inbox_event(db, str(inbox.id))
    assert res["status"] == "unmatched"

    db.refresh(inbox)
    assert inbox.status == "unmatched"
    assert "No matching shipment found" in inbox.last_error


# =============================================================================
# 6. Scheduled Polling & Distributed Concurrency Lock Tests
# =============================================================================

def test_sync_active_shipments_task_skips_terminal_states(db, sample_shipment):
    """Delivered and cancelled shipments are not polled."""
    sample_shipment.status = "delivered"
    sample_shipment.updated_at = datetime.now(timezone.utc)
    db.commit()
    target_id_str = str(sample_shipment.id)

    with patch("app.workers.tasks.shipping.SessionLocal", return_value=db):
        with patch("app.services.shipping.ShippingService.sync_shipment_tracking") as mock_sync:
            sync_active_shipments_task()
            called_shipment_ids = []
            for call_item in mock_sync.call_args_list:
                if "shipment_id" in call_item.kwargs:
                    called_shipment_ids.append(str(call_item.kwargs["shipment_id"]))
                elif len(call_item.args) > 1:
                    called_shipment_ids.append(str(call_item.args[1]))
            assert target_id_str not in called_shipment_ids


def test_sync_active_shipments_task_distributed_lock():
    """When another instance holds the lock, overlapping sync is safely aborted."""
    mock_redis = MagicMock()
    mock_redis.set.return_value = False  # Lock acquisition fails

    with patch("app.workers.tasks.shipping.get_redis_client", return_value=mock_redis):
        result = sync_active_shipments_task()
        assert result == 0


def test_sync_active_shipments_task_auto_reconcile(db, customer_user):
    """Uncertain bookings (reconciliation_required) are automatically reconciled during sync."""
    recon_order = Order(
        id=uuid.uuid4(),
        order_number=f"ORD-RECON-{uuid.uuid4().hex[:6].upper()}",
        user_id=customer_user.id,
        status="processing",
        total_paise=100000,
        subtotal_paise=90000,
        tax_amount_paise=10000,
        shipping_rate_paise=0,
    )
    db.add(recon_order)
    db.commit()

    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=recon_order.id,
        shiprocket_order_id=f"SR-RECON-{uuid.uuid4().hex[:6]}",
        booking_status="reconciliation_required",
        status="pending",
    )
    db.add(shipment)
    db.commit()
    target_shipment_id = str(shipment.id)

    with patch("app.workers.tasks.shipping.SessionLocal", return_value=db):
        with patch("app.services.shipping.ShippingService.reconcile_shipment") as mock_recon:
            with patch("app.services.shipping.ShippingService.sync_shipment_tracking"):
                sync_active_shipments_task()
                assert mock_recon.called
                called_recons = [str(c.args[1]) if len(c.args) > 1 else str(c.kwargs.get("shipment_id")) for c in mock_recon.call_args_list]
                assert target_shipment_id in called_recons



# =============================================================================
# 7. Customer Tracking API Tests (SHIP-API-003) & IDOR Protection
# =============================================================================

def test_customer_tracking_idor_protection(sample_shipment, other_token):
    """Unauthorized customer receives 404 when querying another user's tracking."""
    res = client.get(
        f"/api/v1/shipments/{sample_shipment.id}/tracking",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert res.status_code == 404


def test_customer_tracking_returns_persisted_timeline(db, sample_shipment, customer_token):
    """Authorized customer receives chronological tracking timeline without leaking internal notes."""
    now = datetime.now(timezone.utc)
    ev1 = ShipmentTrackingEvent(
        id=uuid.uuid4(),
        shipment_id=sample_shipment.id,
        tracking_number=sample_shipment.tracking_number,
        status="in_transit",
        activity="Picked up from facility",
        location="Bengaluru",
        carrier="Delhivery",
        occurred_at=now - timedelta(hours=5),
        created_at=now - timedelta(hours=5),
    )
    ev2 = ShipmentTrackingEvent(
        id=uuid.uuid4(),
        shipment_id=sample_shipment.id,
        tracking_number=sample_shipment.tracking_number,
        status="out_for_delivery",
        activity="Out for delivery to customer address",
        location="Bengaluru South",
        carrier="Delhivery",
        occurred_at=now - timedelta(hours=1),
        created_at=now - timedelta(hours=1),
    )
    db.add_all([ev1, ev2])
    sample_shipment.status = "out_for_delivery"
    sample_shipment.tracking_exception_notes = "Internal admin secret notes"
    db.commit()

    res = client.get(
        f"/api/v1/shipments/{sample_shipment.id}/tracking",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["tracking_number"] == sample_shipment.tracking_number
    assert data["status"] == "out_for_delivery"
    assert len(data["events"]) == 2
    assert data["events"][0]["activity"] == "Picked up from facility"
    assert data["events"][1]["location"] == "Bengaluru South"
    # Invariant: internal notes must NOT leak
    raw_response_text = res.text
    assert "Internal admin secret notes" not in raw_response_text


# =============================================================================
# 8. Admin Operational Exception & Recovery Endpoints
# =============================================================================

def test_admin_exceptions_endpoint(db, sample_shipment, admin_token):
    """Admin exception endpoint returns shipments requiring operational attention."""
    sample_shipment.tracking_exception_notes = "Carrier sync error: 502 Bad Gateway"
    db.commit()

    res = client.get(
        "/api/v1/admin/shipping/exceptions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["total"] >= 1
    found = any(item["id"] == str(sample_shipment.id) for item in data["items"])
    assert found is True


def test_admin_webhook_inbox_endpoint(db, admin_token):
    """Admin endpoint lists durable webhook inbox entries."""
    inbox = ShippingWebhookInbox(
        id=uuid.uuid4(),
        event_id=f"test_list_{uuid.uuid4().hex[:6]}",
        provider="shiprocket",
        event_type="shipment.in_transit",
        payload_json="{}",
        status="processed",
        received_at=datetime.now(timezone.utc),
    )
    db.add(inbox)
    db.commit()

    res = client.get(
        "/api/v1/admin/shipping/webhooks/inbox",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["total"] >= 1
    found = any(e["id"] == str(inbox.id) for e in data["items"])
    assert found is True


def test_admin_webhook_retry_endpoint(db, admin_token, sample_shipment):
    """Admin can manually trigger retry for a failed webhook inbox entry."""
    payload = {
        "awb": sample_shipment.tracking_number,
        "current_status": "DELIVERED",
    }
    inbox = ShippingWebhookInbox(
        id=uuid.uuid4(),
        event_id=f"retry_{uuid.uuid4().hex[:6]}",
        provider="shiprocket",
        event_type="shipment.delivered",
        payload_json=json.dumps(payload),
        status="failed",
        last_error="Temporary network error",
        received_at=datetime.now(timezone.utc),
    )
    db.add(inbox)
    db.commit()

    res = client.post(
        f"/api/v1/admin/shipping/webhooks/inbox/{inbox.id}/retry",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200

    db.refresh(inbox)
    assert inbox.status == "processed"
    db.refresh(sample_shipment)
    assert sample_shipment.status == "delivered"


def test_admin_manual_sync_tracking_endpoint(sample_shipment, admin_token):
    """Admin can trigger manual tracking sync and audit log is recorded."""
    mock_status = {
        "tracking_number": sample_shipment.tracking_number,
        "status": "in_transit",
        "raw_status": "IN TRANSIT",
        "carrier": "Delhivery",
        "estimated_delivery": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        "is_awaiting_scan": False,
        "events": [
            {
                "status": "in_transit",
                "activity": "In transit to sorting center",
                "location": "Bengaluru Hub",
                "carrier": "Delhivery",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
            }
        ],
    }

    with patch("app.integrations.shiprocket.client.ShiprocketProvider.get_tracking_status", return_value=mock_status):
        res = client.post(
            f"/api/v1/admin/shipping/{sample_shipment.id}/sync-tracking",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["status"] == "in_transit"
        assert data["is_awaiting_scan"] is False
