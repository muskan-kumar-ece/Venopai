import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.user import User, AuditEvent
from app.models.order import Order, Shipment
from app.models.project import Project, ManufacturingRequest
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture
def db():
    session = TestingSessionLocal()
    yield session
    session.close()

def create_admin_token(db, role="SUPER_ADMIN"):
    admin = User(
        id=uuid.uuid4(),
        email=f"admin_{role.lower()}_{uuid.uuid4().hex[:6]}@venopai.com",
        hashed_password=get_password_hash("AdminPass123!"),
        full_name=f"Admin {role}",
        is_active=True,
        is_superuser=True,
        role=role,
        status="active",
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    token = create_access_token(
        subject=str(admin.id),
        role=role,
        is_admin=True,
        audience="admin",
    )
    return token, admin

def test_admin_orders_api_lifecycle(db):
    token, admin = create_admin_token(db, role="ORDER_MANAGER")
    headers = {"Authorization": f"Bearer {token}"}

    # Create customer & order
    cust = User(
        id=uuid.uuid4(),
        email=f"cust_{uuid.uuid4().hex[:6]}@test.com",
        hashed_password="hash",
        full_name="Order Cust",
        is_active=True,
    )
    db.add(cust)
    db.commit()

    order = Order(
        id=uuid.uuid4(),
        order_number=f"ORD-ADMIN-{uuid.uuid4().hex[:6]}",
        user_id=cust.id,
        status="paid",
        total_amount=1200000,
        total_paise=1200000,
        subtotal_paise=1100000,
        tax_amount_paise=100000,
    )
    db.add(order)
    db.commit()

    # ADMIN-ORD-API-001: List orders
    res = client.get("/api/v1/admin/orders", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data.get("data"), list)

    # ADMIN-ORD-API-002: Get order detail
    res_det = client.get(f"/api/v1/admin/orders/{order.id}", headers=headers)
    assert res_det.status_code == 200
    assert res_det.json()["data"]["id"] == str(order.id)

    # ADMIN-ORD-API-003: Update status
    res_stat = client.patch(
        f"/api/v1/admin/orders/{order.id}/status",
        headers=headers,
        json={"status": "processing", "notes": "Parts picked"},
    )
    assert res_stat.status_code == 200
    assert res_stat.json()["data"]["status"] == "processing"

    # ADMIN-ORD-API-004: Add internal note
    res_note = client.post(
        f"/api/v1/admin/orders/{order.id}/notes",
        headers=headers,
        json={"note": "VIP Client priority shipment"},
    )
    assert res_note.status_code == 200

    # ADMIN-SHIP-API-001: Create order shipment
    res_ship = client.post(
        f"/api/v1/admin/orders/{order.id}/shipment",
        headers=headers,
        json={"carrier": "Delhivery Air", "tracking_number": "DELH_TEST_123"},
    )
    assert res_ship.status_code == 200
    assert res_ship.json()["data"]["carrier"] == "Delhivery Air"

def test_admin_customers_api_lifecycle(db):
    token, admin = create_admin_token(db, role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    cust = User(
        id=uuid.uuid4(),
        email=f"cust_mgt_{uuid.uuid4().hex[:6]}@domain.com",
        hashed_password="hash",
        full_name="Managed Customer",
        is_active=True,
    )
    db.add(cust)
    db.commit()

    # ADMIN-CUST-API-001: List customers
    res = client.get("/api/v1/admin/customers", headers=headers)
    assert res.status_code == 200

    # ADMIN-CUST-API-002: Get customer detail
    res_det = client.get(f"/api/v1/admin/customers/{cust.id}", headers=headers)
    assert res_det.status_code == 200
    assert res_det.json()["data"]["email"] == cust.email

    # ADMIN-CUST-API-003..005: Orders, Requests, Projects
    res_ord = client.get(f"/api/v1/admin/customers/{cust.id}/orders", headers=headers)
    assert res_ord.status_code == 200

    res_req = client.get(f"/api/v1/admin/customers/{cust.id}/requests", headers=headers)
    assert res_req.status_code == 200

    res_proj = client.get(f"/api/v1/admin/customers/{cust.id}/projects", headers=headers)
    assert res_proj.status_code == 200

    # ADMIN-CUST-API-006: Deactivate customer
    res_deact = client.post(
        f"/api/v1/admin/customers/{cust.id}/deactivate",
        headers=headers,
        json={"reason": "Terms violation"},
    )
    assert res_deact.status_code == 200
    assert res_deact.json()["status"] == "customer_deactivated"
    db.refresh(cust)
    assert cust.is_active is False

def test_admin_analytics_audit_and_notifications(db):
    token, admin = create_admin_token(db, role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    # ADMIN-ANALYTICS-API-001 & 002
    res_an = client.get("/api/v1/admin/analytics", headers=headers)
    assert res_an.status_code == 200
    assert "total_orders" in res_an.json()["data"]

    res_exp = client.get("/api/v1/admin/analytics/export", headers=headers)
    assert res_exp.status_code == 200
    assert "Order Number" in res_exp.text

    # ADMIN-AUDIT-API-001
    res_aud = client.get("/api/v1/admin/audit-logs", headers=headers)
    assert res_aud.status_code == 200
    assert isinstance(res_aud.json()["data"], list)

    # ADMIN-NOTIF-API-001
    res_notif = client.get("/api/v1/admin/notifications", headers=headers)
    assert res_notif.status_code == 200
    assert isinstance(res_notif.json()["data"], list)
