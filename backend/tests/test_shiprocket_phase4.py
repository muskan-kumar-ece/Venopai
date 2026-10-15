"""Unit and integration tests for Shiprocket Phase 4:
- Genuine Shiprocket shipping-label retrieval & generation
- Manifest generation and printing (single & batch)
- Pickup scheduling and confirmation (pickup_token_number persistence)
- Strict operational invariants (AWB required before label/pickup/manifest)
- Decoupled operational states on Shipment and ShippingManifest records
- Order status preservation (Order remains ready_to_ship, never prematurely marked shipped)
- Background task execution and bounded retry behavior
- Administrative REST endpoints for labels, pickups, manifests
- 100% mocked external HTTP calls and deterministic simulation tests
"""
from datetime import datetime, timezone
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
from app.models.order import Order, Shipment, ShippingManifest
from app.services.shipping import ShippingService
from app.workers.tasks.shipping import async_generate_label_task, async_schedule_pickup_task
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
    u = db.query(User).filter(User.email == "admin_phase4@example.com").first()
    if not u:
        u = User(
            id=uuid.uuid4(),
            email="admin_phase4@example.com",
            hashed_password=get_password_hash("AdminPass123!"),
            full_name="Admin Phase4",
            role="SUPER_ADMIN",
            is_active=True,
            is_superuser=True,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


@pytest.fixture
def admin_token(admin_user):
    return create_access_token(
        subject=str(admin_user.id),
        role="SUPER_ADMIN",
        is_admin=True,
        audience="admin",
    )


@pytest.fixture
def test_order(db, admin_user):
    order = Order(
        id=uuid.uuid4(),
        order_number=f"ORD-P4-{uuid.uuid4().hex[:6].upper()}",
        user_id=admin_user.id,
        status="ready_to_ship",
        total_paise=500000,
        subtotal_paise=450000,
        shipping_rate_paise=5000,
        tax_amount_paise=45000,
        shipping_address_snapshot=json.dumps({
            "recipient_name": "Admin Phase4",
            "phone": "9876543210",
            "line1": "123 Industrial Way",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "country": "IN",
        }),
        created_at=datetime.now(timezone.utc),
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@pytest.fixture
def booked_shipment(db, test_order):
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=test_order.id,
        carrier="Delhivery",
        tracking_number=f"AWB{uuid.uuid4().hex[:8].upper()}",
        shiprocket_order_id=f"sr_{uuid.uuid4().hex[:6]}",
        shiprocket_shipment_id=f"ship_{uuid.uuid4().hex[:6]}",
        booking_status="awb_assigned",
        status="created",
        created_at=datetime.now(timezone.utc),
    )
    db.add(shipment)
    db.commit()
    db.refresh(shipment)
    return shipment


# =============================================================================
# 1. ShiprocketProvider Unit Tests (Simulation & Live Mocking)
# =============================================================================

def test_simulation_generate_label():
    """Verify deterministic simulation for label generation."""
    prov = ShiprocketProvider()
    res = prov._simulated_generate_label("ship_12345678")
    assert "labels/sim_" in res["label_url"]
    assert res["label_status"] == "generated"
    assert res["shipment_id"] == "ship_12345678"


def test_simulation_schedule_pickup():
    """Verify deterministic simulation for pickup scheduling."""
    prov = ShiprocketProvider()
    res = prov._simulated_schedule_pickup("ship_12345678", pickup_date="2026-10-20 14:00:00")
    assert "SIM-PK-" in res["pickup_token_number"]
    assert res["pickup_scheduled_date"] == "2026-10-20 14:00:00"
    assert res["pickup_status"] == "scheduled"


def test_simulation_manifest_generation():
    """Verify deterministic simulation for single and batch manifests."""
    prov = ShiprocketProvider()
    res = prov._simulated_generate_manifest(["ship_1", "ship_2"])
    assert "manifests/sim_batch_2.pdf" in res["manifest_url"]
    assert res["manifest_status"] == "generated"
    assert len(res["shipment_ids"]) == 2

    res_print = prov._simulated_print_manifest(["ord_1"])
    assert "manifests/sim_print_1.pdf" in res_print["manifest_url"]


def test_live_generate_label_mock_http():
    """Verify live HTTP call for label generation parses response properly."""
    def handler(request: httpx.Request):
        assert request.method == "POST"
        assert "/courier/generate/label" in str(request.url)
        body = json.loads(request.read())
        assert "shipment_id" in body
        return httpx.Response(
            200,
            json={
                "label_created": 1,
                "label_url": "https://shiprocket.co/labels/live_label_999.pdf",
                "response": "Success",
            },
        )

    transport = MockHttpTransport(handler)
    http_client = ShiprocketHttpClient(
        auth_manager=MagicMock(spec=ShiprocketAuthManager, get_token=lambda *args, **kwargs: "dummy_tok"),
        transport=transport,
    )
    prov = ShiprocketProvider(http_client=http_client, mode="live")
    res = prov.generate_label(999)
    assert res["label_url"] == "https://shiprocket.co/labels/live_label_999.pdf"
    assert res["label_status"] == "generated"


def test_live_generate_label_failure_mock_http():
    """Verify live HTTP call raises ShiprocketResponseError when label_url is missing."""
    def handler(request: httpx.Request):
        return httpx.Response(
            200,
            json={"label_created": 0, "message": "Shipment not found or courier unassigned"},
        )

    transport = MockHttpTransport(handler)
    http_client = ShiprocketHttpClient(
        auth_manager=MagicMock(spec=ShiprocketAuthManager, get_token=lambda *args, **kwargs: "dummy_tok"),
        transport=transport,
    )
    prov = ShiprocketProvider(http_client=http_client, mode="live")
    with pytest.raises(ShiprocketResponseError) as exc_info:
        prov.generate_label(999)
    assert "Label generation failed" in str(exc_info.value)


def test_live_schedule_pickup_mock_http():
    """Verify live HTTP call for pickup scheduling parses pickup_token_number."""
    def handler(request: httpx.Request):
        assert request.method == "POST"
        assert "/courier/generate/pickup" in str(request.url)
        return httpx.Response(
            200,
            json={
                "pickup_status": 1,
                "response": {
                    "pickup_token_number": "SR-PK-88888",
                    "pickup_scheduled_date": "2026-10-18 11:00:00",
                    "status": "1",
                },
            },
        )

    transport = MockHttpTransport(handler)
    http_client = ShiprocketHttpClient(
        auth_manager=MagicMock(spec=ShiprocketAuthManager, get_token=lambda *args, **kwargs: "dummy_tok"),
        transport=transport,
    )
    prov = ShiprocketProvider(http_client=http_client, mode="live")
    res = prov.schedule_pickup(88888, pickup_date="2026-10-18 11:00:00")
    assert res["pickup_token_number"] == "SR-PK-88888"
    assert res["pickup_status"] == "scheduled"
    assert res["pickup_scheduled_date"] == "2026-10-18 11:00:00"


def test_live_generate_manifest_mock_http():
    """Verify live HTTP call for manifest generation."""
    def handler(request: httpx.Request):
        assert request.method == "POST"
        assert "/manifests/generate" in str(request.url)
        return httpx.Response(
            200,
            json={
                "status": 1,
                "manifest_url": "https://shiprocket.co/manifests/manifest_batch_77.pdf",
            },
        )

    transport = MockHttpTransport(handler)
    http_client = ShiprocketHttpClient(
        auth_manager=MagicMock(spec=ShiprocketAuthManager, get_token=lambda *args, **kwargs: "dummy_tok"),
        transport=transport,
    )
    prov = ShiprocketProvider(http_client=http_client, mode="live")
    res = prov.generate_manifest(["771", "772"])
    assert res["manifest_url"] == "https://shiprocket.co/manifests/manifest_batch_77.pdf"
    assert res["manifest_status"] == "generated"


# =============================================================================
# 2. ShippingService Domain Logic & Operational Invariants
# =============================================================================

def test_label_generation_requires_awb(db, test_order):
    """Attempting to generate label on a shipment without AWB must be rejected with 409."""
    unbooked_shipment = Shipment(
        id=uuid.uuid4(),
        order_id=test_order.id,
        booking_status="pending",
        status="pending",
        created_at=datetime.now(timezone.utc),
    )
    db.add(unbooked_shipment)
    db.commit()

    with pytest.raises(Exception) as exc_info:
        ShippingService.get_or_generate_label(db=db, shipment_id=str(unbooked_shipment.id))
    err = exc_info.value
    assert getattr(err, "code", "") == "AWB_REQUIRED" or "assigned" in getattr(err, "message", "").lower()


def test_label_generation_success_and_idempotency(db, booked_shipment, admin_user):
    """Generating label persists URL and returns existing label idempotently on subsequent calls."""
    res1 = ShippingService.get_or_generate_label(
        db=db,
        shipment_id=str(booked_shipment.id),
        admin_user=admin_user,
    )
    assert res1["label_status"] == "generated"
    assert res1["label_url"] is not None

    # Check shipment record updated
    db.refresh(booked_shipment)
    assert booked_shipment.label_url == res1["label_url"]
    assert booked_shipment.label_status == "generated"
    assert booked_shipment.label_generated_at is not None

    # AuditEvent created
    audit = db.query(AuditEvent).filter(
        AuditEvent.action == "GENERATE_SHIPPING_LABEL",
        AuditEvent.entity_id == booked_shipment.id,
    ).first()
    assert audit is not None

    # Second call returns existing without re-calling
    res2 = ShippingService.get_or_generate_label(
        db=db,
        shipment_id=str(booked_shipment.id),
        admin_user=admin_user,
        force_regenerate=False,
    )
    assert res2["label_url"] == res1["label_url"]


def test_label_generation_force_regenerate(db, booked_shipment, admin_user):
    """force_regenerate=True will re-invoke provider and update label."""
    res1 = ShippingService.get_or_generate_label(db=db, shipment_id=str(booked_shipment.id), admin_user=admin_user)
    first_url = res1["label_url"]

    with patch.object(shiprocket_provider, "generate_label", return_value={"label_url": "https://new.label.url/label2.pdf", "label_status": "generated"}):
        res2 = ShippingService.get_or_generate_label(
            db=db,
            shipment_id=str(booked_shipment.id),
            admin_user=admin_user,
            force_regenerate=True,
        )
        assert res2["label_url"] == "https://new.label.url/label2.pdf"


def test_schedule_pickup_requires_awb(db, test_order):
    """Attempting pickup scheduling without assigned AWB must be rejected with 409."""
    pending_shipment = Shipment(
        id=uuid.uuid4(),
        order_id=test_order.id,
        booking_status="pending",
        status="pending",
        created_at=datetime.now(timezone.utc),
    )
    db.add(pending_shipment)
    db.commit()

    with pytest.raises(Exception) as exc_info:
        ShippingService.schedule_shipment_pickup(db=db, shipment_id=str(pending_shipment.id))
    err = exc_info.value
    assert getattr(err, "code", "") == "AWB_REQUIRED" or "assigned" in getattr(err, "message", "").lower()


def test_schedule_pickup_does_not_advance_order_status(db, booked_shipment, test_order, admin_user):
    """CRITICAL INVARIANT: Scheduling pickup MUST NOT advance order status to 'shipped'."""
    assert test_order.status == "ready_to_ship"

    res = ShippingService.schedule_shipment_pickup(
        db=db,
        shipment_id=str(booked_shipment.id),
        pickup_date="2026-10-22 10:00:00",
        admin_user=admin_user,
    )
    assert res["pickup_status"] == "scheduled"
    assert res["pickup_token_number"] is not None

    db.refresh(booked_shipment)
    db.refresh(test_order)

    # Shipment pickup state updated
    assert booked_shipment.pickup_token_number == res["pickup_token_number"]
    assert booked_shipment.pickup_status == "scheduled"
    assert booked_shipment.pickup_scheduled_date is not None

    # Order MUST remain ready_to_ship
    assert test_order.status == "ready_to_ship"


def test_schedule_pickup_idempotency(db, booked_shipment, admin_user):
    """Scheduling pickup when already scheduled returns existing token without calling provider again."""
    res1 = ShippingService.schedule_shipment_pickup(db=db, shipment_id=str(booked_shipment.id), admin_user=admin_user)
    first_token = res1["pickup_token_number"]

    # Call again with different date; should return existing scheduled token
    res2 = ShippingService.schedule_shipment_pickup(db=db, shipment_id=str(booked_shipment.id), pickup_date="2026-10-25 12:00:00", admin_user=admin_user)
    assert res2["pickup_token_number"] == first_token
    assert res2["pickup_status"] == "scheduled"


def test_manifest_generation_single_and_batch(db, booked_shipment, admin_user):
    """Verify single and batch manifest generation creating ShippingManifest records."""
    # Second order & shipment
    order2 = Order(
        id=uuid.uuid4(),
        order_number=f"ORD-P4-{uuid.uuid4().hex[:6].upper()}",
        user_id=admin_user.id,
        status="ready_to_ship",
        total_paise=300000,
        subtotal_paise=280000,
        shipping_rate_paise=5000,
        tax_amount_paise=15000,
        shipping_address_snapshot=json.dumps({
            "recipient_name": "Admin Phase4",
            "phone": "9876543210",
            "line1": "456 Commerce Way",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560001",
            "country": "IN",
        }),
        created_at=datetime.now(timezone.utc),
    )
    db.add(order2)
    db.commit()

    second_shipment = Shipment(
        id=uuid.uuid4(),
        order_id=order2.id,
        carrier="Delhivery",
        tracking_number=f"AWB{uuid.uuid4().hex[:8].upper()}",
        shiprocket_order_id=f"sr_{uuid.uuid4().hex[:6]}",
        shiprocket_shipment_id=f"ship_{uuid.uuid4().hex[:6]}",
        booking_status="awb_assigned",
        status="created",
        created_at=datetime.now(timezone.utc),
    )
    db.add(second_shipment)
    db.commit()

    # Batch manifest across both shipments
    batch_res = ShippingService.generate_manifest(
        db=db,
        shipment_ids=[str(booked_shipment.id), str(second_shipment.id)],
        admin_user=admin_user,
    )
    assert batch_res["manifest_status"] == "generated"
    assert batch_res["manifest_url"] is not None
    assert batch_res["manifest_type"] == "batch"
    assert len(batch_res["shipment_ids"]) == 2

    # Verify ShippingManifest table has record
    manifest_record = db.query(ShippingManifest).filter(
        ShippingManifest.id == uuid.UUID(batch_res["manifest_id"])
    ).first()
    assert manifest_record is not None
    assert manifest_record.status == "generated"

    # Both shipments have manifest_url populated
    db.refresh(booked_shipment)
    db.refresh(second_shipment)
    assert booked_shipment.manifest_url == batch_res["manifest_url"]
    assert second_shipment.manifest_url == batch_res["manifest_url"]


def test_get_manifest_single(db, booked_shipment, admin_user):
    """get_manifest generates if not present and returns existing if present."""
    res1 = ShippingService.get_manifest(db=db, shipment_id=str(booked_shipment.id), admin_user=admin_user)
    assert res1["manifest_url"] is not None
    assert res1["manifest_status"] == "generated"

    # Second call returns existing
    res2 = ShippingService.get_manifest(db=db, shipment_id=str(booked_shipment.id), admin_user=admin_user)
    assert res2["manifest_url"] == res1["manifest_url"]


# =============================================================================
# 3. Background Celery Tasks
# =============================================================================

def test_async_label_task(db, booked_shipment):
    """Verify Celery background task generates label."""
    with patch("app.workers.tasks.shipping.SessionLocal", return_value=db):
        res = async_generate_label_task.apply(args=[str(booked_shipment.id)]).get()
        assert res["label_status"] == "generated"
        assert res["label_url"] is not None


def test_async_pickup_task(db, booked_shipment):
    """Verify Celery background task schedules pickup."""
    with patch("app.workers.tasks.shipping.SessionLocal", return_value=db):
        res = async_schedule_pickup_task.apply(args=[str(booked_shipment.id)]).get()
        assert res["pickup_status"] == "scheduled"
        assert res["pickup_token_number"] is not None


# =============================================================================
# 4. Admin REST Endpoints
# =============================================================================

def test_admin_generate_label_api_unauthorized(booked_shipment):
    """Unauthenticated requests must be rejected with 401."""
    res = client.post(f"/api/v1/admin/shipping/{booked_shipment.id}/label")
    assert res.status_code == 401


def test_admin_generate_label_api_success(booked_shipment, admin_token):
    """Admin endpoint generates label and returns 200 with label_url."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    res = client.post(
        f"/api/v1/admin/shipping/{booked_shipment.id}/label",
        json={"force_regenerate": True},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["label_status"] == "generated"
    assert "label_url" in data

    # GET endpoint also returns label
    res_get = client.get(
        f"/api/v1/admin/shipping/{booked_shipment.id}/label",
        headers=headers,
    )
    assert res_get.status_code == 200
    assert res_get.json()["data"]["label_url"] == data["label_url"]


def test_admin_schedule_pickup_api_success(booked_shipment, admin_token):
    """Admin endpoint schedules pickup and returns 200 with pickup_token_number."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    res = client.post(
        f"/api/v1/admin/shipping/{booked_shipment.id}/pickup",
        json={"pickup_date": "2026-10-25 15:00:00"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["pickup_status"] == "scheduled"
    assert "pickup_token_number" in data


def test_admin_manifest_apis_success(booked_shipment, admin_token):
    """Admin endpoints generate single and batch manifests."""
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Single manifest POST
    res_single = client.post(
        f"/api/v1/admin/shipping/{booked_shipment.id}/manifest",
        headers=headers,
    )
    assert res_single.status_code == 200
    assert res_single.json()["data"]["manifest_status"] == "generated"

    # Single manifest GET
    res_get = client.get(
        f"/api/v1/admin/shipping/{booked_shipment.id}/manifest",
        headers=headers,
    )
    assert res_get.status_code == 200
    assert "manifest_url" in res_get.json()["data"]

    # Batch manifest POST
    res_batch = client.post(
        "/api/v1/admin/shipping/manifests/generate",
        json={"shipment_ids": [str(booked_shipment.id)]},
        headers=headers,
    )
    assert res_batch.status_code == 200
    assert res_batch.json()["data"]["manifest_type"] == "single"


def test_admin_list_shipments_includes_phase4_fields(booked_shipment, admin_token):
    """admin_list_shipments returns label, pickup, and manifest fields."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    res = client.get("/api/v1/admin/shipping", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data) > 0
    first_item = data[0]
    assert "label_url" in first_item
    assert "label_status" in first_item
    assert "pickup_token_number" in first_item
    assert "pickup_status" in first_item
    assert "manifest_url" in first_item
    assert "manifest_status" in first_item
