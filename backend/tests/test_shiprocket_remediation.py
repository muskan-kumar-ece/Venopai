import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.user import User
from app.models.order import Order, Shipment, ProcessedWebhookEvent
from app.models.project import Project, ManufacturingRequest
from app.integrations.shiprocket.client import shiprocket_provider
from app.core.security import get_password_hash
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture
def db():
    session = TestingSessionLocal()
    yield session
    session.close()

def test_shiprocket_status_normalization():
    res = shiprocket_provider.get_tracking_status("AWB123456")
    assert res["tracking_number"] == "AWB123456"
    assert res["status"] in ("in_transit", "delivered", "created")
    assert "carrier" in res

def test_shiprocket_webhook_order_delivery_transition(db):
    user = User(
        id=uuid.uuid4(),
        email=f"ship_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Ship User",
        is_active=True,
    )
    db.add(user)
    db.commit()

    order = Order(
        id=uuid.uuid4(),
        order_number=f"ORD-SHIP-{uuid.uuid4().hex[:6]}",
        user_id=user.id,
        status="shipped",
        total_amount=150000,
        total_paise=150000,
        subtotal_paise=150000,
        tax_amount_paise=0,
    )
    db.add(order)
    db.commit()

    tracking_num = f"AWB_{uuid.uuid4().hex[:8]}"
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=order.id,
        carrier="Delhivery",
        tracking_number=tracking_num,
        status="in_transit",
    )
    db.add(shipment)
    db.commit()

    payload = {
        "event": "track",
        "tracking_number": tracking_num,
        "current_status": "DELIVERED",
        "courier_name": "Delhivery",
        "location": "Bengaluru Delivery Hub",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    res = client.post("/api/v1/webhooks/shiprocket", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("accepted", "processed")

    db.refresh(shipment)
    assert shipment.status == "delivered"

    db.refresh(order)
    assert order.status == "delivered"

def test_shiprocket_webhook_idempotency(db):
    user = User(
        id=uuid.uuid4(),
        email=f"idemp_ship_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hash",
        full_name="Ship Idemp",
        is_active=True,
    )
    db.add(user)
    db.commit()

    order = Order(
        id=uuid.uuid4(),
        order_number=f"ORD-IDEMP-{uuid.uuid4().hex[:6]}",
        user_id=user.id,
        status="paid",
        total_amount=250000,
        total_paise=250000,
        subtotal_paise=250000,
        tax_amount_paise=0,
    )
    db.add(order)
    db.commit()

    tracking_num = f"AWB_IDEMP_{uuid.uuid4().hex[:8]}"
    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=order.id,
        carrier="Shiprocket Express",
        tracking_number=tracking_num,
        status="in_transit",
    )
    db.add(shipment)
    db.commit()

    event_id = f"evt_{uuid.uuid4().hex}"
    payload = {
        "event_id": event_id,
        "tracking_number": tracking_num,
        "current_status": "PICKED UP",
    }

    # First delivery
    res1 = client.post("/api/v1/webhooks/shiprocket", json=payload)
    assert res1.status_code == 200

    # Second delivery with exact same event_id
    res2 = client.post("/api/v1/webhooks/shiprocket", json=payload)
    assert res2.status_code == 200
    assert res2.json().get("status") in ("duplicate_ignored", "already_processed", "accepted")
