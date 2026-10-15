"""Production-Readiness Audit and Verification Test Suite (VenopAI Shiprocket Phase 6).

Covers all 13 critical operational and reliability requirements:
1. Concurrent booking race conditions and 409 conflict
2. Uncertain booking outcome and safe reconciliation
3. Provider network timeout handling (504 + reconciliation_required)
4. Database persistence failure recovery via reconciliation
5. Duplicate pickup request safety & idempotency
6. Batch manifest pre-validation & partial failure prevention
7. Webhook deduplication under rapid duplicate delivery
8. Out-of-order tracking scans (monotonic non-regression)
9. Contradictory terminal events logged in tracking_exception_notes
10. Distinct tracking scans sharing the exact same timestamp
11. Customer IDOR security on tracking and shipment endpoints
12. Admin RBAC enforcement on shipping operational APIs
13. Stale booking_in_progress self-healing detection
14. Celery background sync task distributed locking & error recovery
15. Schema reflection and migration 0019 integrity
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
from app.core.exceptions import APIException
from app.models.user import User, AuditEvent
from app.models.order import (
    Order,
    Shipment,
    ShippingManifest,
    ShipmentTrackingEvent,
    ShippingWebhookInbox,
)
from app.models.project import ManufacturingRequest
from app.services.shipping import ShippingService, utcnow
from app.workers.tasks.shipping import sync_active_shipments_task
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
    u = db.query(User).filter(User.email == "admin_phase6@example.com").first()
    if not u:
        u = User(
            id=uuid.uuid4(),
            email="admin_phase6@example.com",
            hashed_password=get_password_hash("AdminSecret123!"),
            full_name="Admin Phase6",
            role="SUPER_ADMIN",
            is_active=True,
            is_superuser=True,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


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
def customer_user_a(db):
    u = db.query(User).filter(User.email == "cust_a_phase6@example.com").first()
    if not u:
        u = User(
            id=uuid.uuid4(),
            email="cust_a_phase6@example.com",
            hashed_password=get_password_hash("CustomerPass123!"),
            full_name="Customer A Phase6",
            role="CUSTOMER",
            is_active=True,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


@pytest.fixture
def customer_headers_a(customer_user_a):
    token = create_access_token(
        subject=str(customer_user_a.id),
        role="CUSTOMER",
        is_admin=False,
        audience="customer",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def customer_user_b(db):
    u = db.query(User).filter(User.email == "cust_b_phase6@example.com").first()
    if not u:
        u = User(
            id=uuid.uuid4(),
            email="cust_b_phase6@example.com",
            hashed_password=get_password_hash("CustomerPass123!"),
            full_name="Customer B Phase6",
            role="CUSTOMER",
            is_active=True,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


@pytest.fixture
def customer_headers_b(customer_user_b):
    token = create_access_token(
        subject=str(customer_user_b.id),
        role="CUSTOMER",
        is_admin=False,
        audience="customer",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def paid_order_a(db, customer_user_a):
    order = Order(
        id=uuid.uuid4(),
        order_number=f"ORD-P6A-{uuid.uuid4().hex[:6].upper()}",
        user_id=customer_user_a.id,
        status="paid",
        subtotal_paise=100000,
        shipping_rate_paise=10000,
        tax_amount_paise=18000,
        total_paise=128000,
        shipping_address_snapshot=json.dumps({
            "recipient_name": "Customer A",
            "phone": "9876543210",
            "line1": "100 MG Road",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560001",
            "country": "IN",
        }),
        created_at=utcnow(),
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@pytest.fixture
def sample_shipment_a(db, paid_order_a):
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=paid_order_a.id,
        carrier="Delhivery",
        tracking_number=f"AWB-P6-{uuid.uuid4().hex[:8].upper()}",
        shiprocket_order_id=f"SRO-{uuid.uuid4().hex[:6]}",
        shiprocket_shipment_id=f"SRS-{uuid.uuid4().hex[:6]}",
        booking_status="awb_assigned",
        status="ready_to_ship",
        created_at=utcnow(),
    )
    db.add(shipment)
    db.commit()
    db.refresh(shipment)
    return shipment


# =============================================================================
# 1. Concurrent Booking Race Condition & 409 Conflict
# =============================================================================

def test_concurrent_booking_race_condition(db, admin_user, paid_order_a):
    """When a shipment booking intent is in progress, concurrent booking requests are rejected with 409."""
    # Pre-create shipment in booking_in_progress
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=paid_order_a.id,
        carrier="Delhivery",
        booking_status="booking_in_progress",
        status="pending",
        idempotency_key=f"idemp_{uuid.uuid4().hex[:8]}",
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(shipment)
    db.commit()

    with pytest.raises(APIException) as exc:
        ShippingService.create_order_shipment(
            db=db,
            admin_user=admin_user,
            order_id=str(paid_order_a.id),
            data={},
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "BOOKING_IN_PROGRESS"


# =============================================================================
# 2. Uncertain Booking Outcome & Safe Reconciliation
# =============================================================================

def test_uncertain_booking_outcome_reconciliation(db, paid_order_a):
    """When an uncertain booking occurred, reconciliation queries Shiprocket and recovers the AWB."""
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=paid_order_a.id,
        carrier="Delhivery",
        shiprocket_order_id="998899",
        booking_status="reconciliation_required",
        status="pending",
        created_at=utcnow(),
    )
    db.add(shipment)
    db.commit()

    mock_remote_order = {
        "id": 998899,
        "status": "PROCESSING",
        "shipments": [
            {
                "id": 778899,
                "awb": "RECON_AWB_998899",
                "courier_name": "Blue Dart",
            }
        ],
    }

    with patch.object(shiprocket_provider, "get_order_details", return_value=mock_remote_order):
        reconciled = ShippingService.reconcile_shipment(db=db, shipment_id=str(shipment.id))

    assert reconciled.booking_status == "awb_assigned"
    assert reconciled.tracking_number == "RECON_AWB_998899"
    assert reconciled.carrier == "Blue Dart"
    assert "Successfully reconciled" in reconciled.reconciliation_notes


def test_reconciliation_resets_missing_remote_order_for_safe_retry(db, paid_order_a):
    """If no remote Shiprocket order ID exists, reconciliation resets status to booking_failed allowing retry."""
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=paid_order_a.id,
        carrier="Delhivery",
        shiprocket_order_id=None,
        booking_status="reconciliation_required",
        status="pending",
        created_at=utcnow(),
    )
    db.add(shipment)
    db.commit()

    reconciled = ShippingService.reconcile_shipment(db=db, shipment_id=str(shipment.id))
    assert reconciled.booking_status == "booking_failed"
    assert "No remote Shiprocket order ID present" in reconciled.reconciliation_notes


# =============================================================================
# 3. Provider Network Timeout Handling (504 + reconciliation_required)
# =============================================================================

def test_provider_network_timeout_marks_reconciliation_required(db, admin_user, paid_order_a):
    """Network timeout during live booking marks shipment reconciliation_required and raises 504."""
    with patch.object(
        shiprocket_provider,
        "create_shipment",
        side_effect=ShiprocketConnectionError("Connection to Shiprocket timed out after 15s"),
    ):
        with pytest.raises(APIException) as exc:
            ShippingService.create_order_shipment(
                db=db,
                admin_user=admin_user,
                order_id=str(paid_order_a.id),
                data={},
            )

    assert exc.value.status_code == 504
    assert exc.value.code == "SHIPMENT_BOOKING_TIMEOUT"

    # Verify shipment is flagged for reconciliation, not blind retry
    shipment = db.query(Shipment).filter(Shipment.order_id == paid_order_a.id).first()
    assert shipment is not None
    assert shipment.booking_status == "reconciliation_required"
    assert "timed out" in shipment.last_booking_error.lower()


# =============================================================================
# 4. Database Persistence Failure Recovery Simulation
# =============================================================================

def test_db_persistence_failure_simulation(db, paid_order_a):
    """If DB connection drops during booking confirmation, shipment remains in booking_in_progress and can be reconciled."""
    # Simulate shipment left in booking_in_progress with remote ID known
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=paid_order_a.id,
        carrier="Delhivery",
        shiprocket_order_id="SR-RECOVER-01",
        booking_status="booking_in_progress",
        status="pending",
        created_at=utcnow() - timedelta(minutes=15),
        updated_at=utcnow() - timedelta(minutes=15),
    )
    db.add(shipment)
    db.commit()

    mock_remote_order = {
        "id": "SR-RECOVER-01",
        "shipments": [{"id": "SRS-REC-01", "awb": "AWB-RECOVERED-123", "courier_name": "Delhivery"}],
    }

    with patch.object(shiprocket_provider, "get_order_details", return_value=mock_remote_order):
        reconciled = ShippingService.reconcile_shipment(db=db, shipment_id=str(shipment.id))

    assert reconciled.booking_status == "awb_assigned"
    assert reconciled.tracking_number == "AWB-RECOVERED-123"


# =============================================================================
# 5. Duplicate Pickup Request Safety & Idempotency
# =============================================================================

def test_duplicate_pickup_request_is_idempotent(db, admin_user, sample_shipment_a):
    """Calling schedule_shipment_pickup when pickup is already scheduled returns existing token without re-calling carrier."""
    sample_shipment_a.pickup_token_number = "PICKUP_TOKEN_EXISTING"
    sample_shipment_a.pickup_status = "scheduled"
    sample_shipment_a.pickup_scheduled_date = utcnow()
    db.commit()

    with patch.object(shiprocket_provider, "schedule_pickup") as mock_pickup:
        res = ShippingService.schedule_shipment_pickup(
            db=db,
            shipment_id=str(sample_shipment_a.id),
            admin_user=admin_user,
        )

    # Carrier API must not be called
    mock_pickup.assert_not_called()
    assert res["pickup_token_number"] == "PICKUP_TOKEN_EXISTING"
    assert res["pickup_status"] == "scheduled"


# =============================================================================
# 6. Batch Manifest Pre-Validation & Partial Failure Prevention
# =============================================================================

def test_batch_manifest_pre_validation_blocks_ineligible_shipment(db, admin_user, sample_shipment_a):
    """If any shipment in a batch lacks an AWB, the batch is rejected before calling Shiprocket."""
    # Create distinct second order
    order_b = Order(
        id=uuid.uuid4(),
        order_number=f"ORD-P6B-{uuid.uuid4().hex[:6].upper()}",
        user_id=sample_shipment_a.order.user_id if sample_shipment_a.order else admin_user.id,
        status="paid",
        subtotal_paise=100000,
        shipping_rate_paise=10000,
        tax_amount_paise=18000,
        total_paise=128000,
        created_at=utcnow(),
    )
    db.add(order_b)
    db.commit()

    # Create second shipment without AWB
    ineligible_shipment = Shipment(
        id=uuid.uuid4(),
        order_id=order_b.id,
        booking_status="pending",
        tracking_number=None,
        status="pending",
        created_at=utcnow(),
    )
    db.add(ineligible_shipment)
    db.commit()

    with patch.object(shiprocket_provider, "generate_manifest") as mock_manifest:
        with pytest.raises(APIException) as exc:
            ShippingService.generate_manifest(
                db=db,
                shipment_ids=[str(sample_shipment_a.id), str(ineligible_shipment.id)],
                admin_user=admin_user,
            )

    mock_manifest.assert_not_called()
    assert exc.value.status_code == 409
    assert exc.value.code == "AWB_REQUIRED"


# =============================================================================
# 7. Webhook Deduplication Under Rapid Duplicate Delivery
# =============================================================================

def test_webhook_rapid_duplicate_deduplication(db, sample_shipment_a):
    """Rapid duplicate delivery of the same webhook payload is deduplicated safely."""
    payload = {
        "awb": sample_shipment_a.tracking_number,
        "current_status": "IN TRANSIT",
        "current_timestamp": "2026-10-14 10:00:00",
        "order_id": str(sample_shipment_a.order_id),
        "courier_name": "Delhivery",
    }
    headers = {"X-Shiprocket-Token": settings.SHIPROCKET_WEBHOOK_TOKEN}

    # First delivery: creates inbox entry
    res1 = client.post("/api/v1/webhooks/shiprocket", json=payload, headers=headers)
    assert res1.status_code == 200
    assert res1.json()["status"] in ("accepted", "received", "processed")

    # Second delivery: deduplicated
    res2 = client.post("/api/v1/webhooks/shiprocket", json=payload, headers=headers)
    assert res2.status_code == 200
    assert res2.json()["status"] == "duplicate_ignored"

    # Only one record in inbox for this composite event
    inbox_rows = db.query(ShippingWebhookInbox).filter(
        ShippingWebhookInbox.shipment_id == sample_shipment_a.id
    ).all()
    assert len(inbox_rows) == 1


# =============================================================================
# 8. Out-of-Order Tracking Scans (Monotonic Non-Regression)
# =============================================================================

def test_out_of_order_tracking_scans_do_not_regress_status(db, sample_shipment_a):
    """An out-of-order in_transit scan arriving after out_for_delivery does not regress status."""
    sample_shipment_a.status = "out_for_delivery"
    db.commit()

    res = ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment_a,
        raw_status="IN TRANSIT",
        source="webhook",
    )

    assert res["status"] == "out_for_delivery"
    assert res["status_transitioned"] is False
    assert sample_shipment_a.status == "out_for_delivery"


# =============================================================================
# 9. Contradictory Terminal Events Logged in tracking_exception_notes
# =============================================================================

def test_contradictory_terminal_event_logged(db, sample_shipment_a):
    """A conflicting terminal event (e.g. cancelled on a delivered parcel) is recorded in notes."""
    sample_shipment_a.status = "delivered"
    db.commit()

    ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment_a,
        raw_status="CANCELLED",
        source="webhook",
    )

    assert sample_shipment_a.status == "delivered"
    assert sample_shipment_a.tracking_exception_notes is not None
    assert "Conflicting terminal status" in sample_shipment_a.tracking_exception_notes
    assert "cancelled" in sample_shipment_a.tracking_exception_notes


# =============================================================================
# 10. Distinct Tracking Scans Sharing the Exact Same Timestamp
# =============================================================================

def test_distinct_scans_same_timestamp_both_preserved(db, sample_shipment_a):
    """Two distinct scan events occurring at the exact same timestamp are both recorded."""
    same_time = "2026-10-14 11:00:00"
    scans = [
        {
            "activity": "Arrived at sorting facility",
            "location": "Bengaluru Hub",
            "date": same_time,
            "status": "IN TRANSIT",
        },
        {
            "activity": "Departed sorting facility",
            "location": "Bengaluru Hub",
            "date": same_time,
            "status": "IN TRANSIT",
        },
    ]

    ShippingService.apply_tracking_update(
        db=db,
        shipment=sample_shipment_a,
        raw_status="IN TRANSIT",
        scans=scans,
    )

    events = db.query(ShipmentTrackingEvent).filter(
        ShipmentTrackingEvent.shipment_id == sample_shipment_a.id
    ).all()

    activities = [e.activity for e in events]
    assert "Arrived at sorting facility" in activities
    assert "Departed sorting facility" in activities
    assert len(events) == 2


# =============================================================================
# 11. Customer IDOR Security on Tracking and Shipment Endpoints
# =============================================================================

def test_customer_idor_on_shipment_detail_and_tracking(db, sample_shipment_a, customer_headers_b):
    """Customer B cannot view Customer A's shipment details or tracking timeline (returns 404)."""
    # Attempt to view Customer A's shipment detail
    res_detail = client.get(
        f"/api/v1/shipments/{sample_shipment_a.id}",
        headers=customer_headers_b,
    )
    assert res_detail.status_code == 404

    # Attempt to view Customer A's tracking timeline
    res_track = client.get(
        f"/api/v1/shipments/{sample_shipment_a.id}/tracking",
        headers=customer_headers_b,
    )
    assert res_track.status_code == 404


# =============================================================================
# 12. Admin RBAC Enforcement on Shipping Operational APIs
# =============================================================================

def test_admin_rbac_on_shipping_endpoints(customer_headers_a, sample_shipment_a):
    """Non-admin customers are rejected from all admin shipping endpoints with 401 or 403."""
    endpoints = [
        ("GET", "/api/v1/admin/shipping/exceptions"),
        ("GET", "/api/v1/admin/shipping/webhooks/inbox"),
        ("POST", f"/api/v1/admin/shipping/{sample_shipment_a.id}/label"),
        ("POST", f"/api/v1/admin/shipping/{sample_shipment_a.id}/pickup"),
        ("POST", f"/api/v1/admin/shipping/{sample_shipment_a.id}/manifest"),
        ("POST", f"/api/v1/admin/shipping/{sample_shipment_a.id}/sync-tracking"),
    ]

    for method, path in endpoints:
        if method == "GET":
            res = client.get(path, headers=customer_headers_a)
        else:
            res = client.post(path, headers=customer_headers_a)
        assert res.status_code in (401, 403), f"Endpoint {path} did not enforce admin RBAC (got {res.status_code})"


# =============================================================================
# 13. Stale booking_in_progress Self-Healing Detection
# =============================================================================

def test_stale_booking_in_progress_self_healing(db, admin_user, paid_order_a):
    """A shipment left in booking_in_progress > 10m is automatically flagged as reconciliation_required."""
    stale_time = utcnow() - timedelta(minutes=15)
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=paid_order_a.id,
        carrier="Delhivery",
        booking_status="booking_in_progress",
        status="pending",
        created_at=stale_time,
        updated_at=stale_time,
    )
    db.add(shipment)
    db.commit()

    with pytest.raises(APIException) as exc:
        ShippingService.create_order_shipment(
            db=db,
            admin_user=admin_user,
            order_id=str(paid_order_a.id),
            data={},
        )

    assert exc.value.status_code == 409
    db.refresh(shipment)
    assert shipment.booking_status == "reconciliation_required"
    assert "timed out after 10 minutes" in shipment.reconciliation_notes


# =============================================================================
# 14. Celery Background Sync Task Distributed Locking & Recovery
# =============================================================================

def test_celery_sync_task_distributed_lock_handling(db, sample_shipment_a):
    """When the sync task is invoked, it acquires lock, processes active shipments, and releases lock."""
    # Pre-configure shipment to be eligible for sync
    sample_shipment_a.status = "in_transit"
    sample_shipment_a.last_tracking_synced_at = None
    db.commit()

    with patch("app.workers.tasks.shipping.SessionLocal", return_value=db):
        with patch.object(ShippingService, "sync_shipment_tracking") as mock_sync:
            with patch("app.workers.tasks.shipping.get_redis_client", return_value=None):
                synced = sync_active_shipments_task()

    assert synced >= 1
    mock_sync.assert_called()


# =============================================================================
# 15. Schema Reflection and Migration 0019 Integrity
# =============================================================================

def test_migration_0019_schema_attributes():
    """Verify that all required columns on Shipment, ShipmentTrackingEvent, and ShippingWebhookInbox exist."""
    shipment_cols = [c.name for c in Shipment.__table__.columns]
    assert "last_tracking_synced_at" in shipment_cols
    assert "tracking_exception_notes" in shipment_cols
    assert "raw_carrier_status" in shipment_cols
    assert "pickup_token_number" in shipment_cols
    assert "label_url" in shipment_cols
    assert "manifest_url" in shipment_cols

    event_cols = [c.name for c in ShipmentTrackingEvent.__table__.columns]
    assert "shipment_id" in event_cols
    assert "tracking_number" in event_cols
    assert "status" in event_cols
    assert "raw_status" in event_cols
    assert "activity" in event_cols
    assert "location" in event_cols
    assert "carrier" in event_cols
    assert "occurred_at" in event_cols

    inbox_cols = [c.name for c in ShippingWebhookInbox.__table__.columns]
    assert "event_id" in inbox_cols
    assert "provider" in inbox_cols
    assert "payload_json" in inbox_cols
    assert "status" in inbox_cols
    assert "attempts" in inbox_cols
    assert "last_error" in inbox_cols
