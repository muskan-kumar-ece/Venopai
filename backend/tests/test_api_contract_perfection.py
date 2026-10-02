import uuid
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.core.security import create_access_token, get_password_hash
from app.models.user import User
from app.models.catalog import Product, Category, Inventory
from app.models.order import Order, Payment, Shipment
from app.models.project import ManufacturingRequest, DesignRequest, SoftwareRequest, ConsultationRequest, Project, Quote
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture
def db():
    session = TestingSessionLocal()
    yield session
    session.close()


def _create_user(db: Session, email_prefix: str, role: str = "customer", is_super: bool = False) -> User:
    email = f"{email_prefix}_{uuid.uuid4().hex[:6]}@example.com"
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=get_password_hash("SecretPassword123!"),
        full_name="Test User",
        status="verified",
        role=role,
        is_superuser=is_super,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth_headers(user: User, is_admin: bool = False) -> dict:
    token = create_access_token(
        str(user.id),
        role=user.role,
        is_admin=is_admin,
        audience="admin" if is_admin else "customer",
    )
    return {"Authorization": f"Bearer {token}"}


def test_admin_dashboard_role_scoping_and_rbac(db: Session):
    """
    Verify ADMIN-DASH-API-001 (GET /api/v1/admin/dashboard):
    1. Unauthenticated request is rejected (401)
    2. Regular customer token is rejected with 403 Forbidden
    3. SUPER_ADMIN receives union of all queues and metrics
    4. MANUFACTURING_MANAGER receives manufacturing queues
    5. ORDER_MANAGER receives order/inventory queues
    """
    # 1. Unauthenticated
    res = client.get("/api/v1/admin/dashboard")
    assert res.status_code in (401, 403)

    # 2. Customer token -> 403
    cust = _create_user(db, "dash_cust", role="customer")
    res = client.get("/api/v1/admin/dashboard", headers=_auth_headers(cust, is_admin=False))
    assert res.status_code == 403

    # Seed data
    mfg_req = ManufacturingRequest(
        id=uuid.uuid4(),
        user_id=cust.id,
        title="PCB Dash Test",
        project_overview="Overview",
        status="submitted",
    )
    db.add(mfg_req)

    prod = Product(
        id=uuid.uuid4(),
        name="Dash Product",
        slug=f"dash-prod-{uuid.uuid4().hex[:6]}",
        price_paise=50000,
        status="active",
        sku=f"SKU-{uuid.uuid4().hex[:6]}",
    )
    db.add(prod)
    db.flush()

    inv = Inventory(
        id=uuid.uuid4(),
        product_id=prod.id,
        stock_quantity=3,
        reserved_quantity=0,
        reorder_point=5,
    )
    db.add(inv)

    order = Order(
        id=uuid.uuid4(),
        user_id=cust.id,
        order_number=f"VNP-ORD-{uuid.uuid4().hex[:6]}",
        total_amount=50000,
        total_paise=50000,
        status="paid",
    )
    db.add(order)
    db.commit()

    # 3. SUPER_ADMIN
    super_admin = _create_user(db, "dash_super", role="SUPER_ADMIN", is_super=True)
    res_super = client.get("/api/v1/admin/dashboard", headers=_auth_headers(super_admin, is_admin=True))
    assert res_super.status_code == 200
    data_super = res_super.json()["data"]
    assert "queues" in data_super
    assert "headline_metrics" in data_super
    assert "new_requests_awaiting_review" in data_super["queues"]
    assert "new_orders" in data_super["queues"]
    assert "low_stock_alerts" in data_super["queues"]
    assert data_super["role"] == "SUPER_ADMIN"

    # 4. MANUFACTURING_MANAGER
    mfg_admin = _create_user(db, "dash_mfg", role="MANUFACTURING_MANAGER")
    res_mfg = client.get("/api/v1/admin/dashboard", headers=_auth_headers(mfg_admin, is_admin=True))
    assert res_mfg.status_code == 200
    data_mfg = res_mfg.json()["data"]
    assert "new_requests_awaiting_review" in data_mfg["queues"]
    assert "open_requests" in data_mfg["headline_metrics"]
    # Should not contain order queues
    assert "new_orders" not in data_mfg["queues"]

    # 5. ORDER_MANAGER
    ord_admin = _create_user(db, "dash_ord", role="ORDER_MANAGER")
    res_ord = client.get("/api/v1/admin/dashboard", headers=_auth_headers(ord_admin, is_admin=True))
    assert res_ord.status_code == 200
    data_ord = res_ord.json()["data"]
    assert "new_orders" in data_ord["queues"]
    assert "low_stock_alerts" in data_ord["queues"]
    assert "open_orders" in data_ord["headline_metrics"]
    # Should not contain manufacturing queues
    assert "new_requests_awaiting_review" not in data_ord["queues"]


def test_shipment_contract_route_aliases(db: Session):
    """
    Verify SHIP-API-002 and SHIP-API-003 resolve correctly under both:
    1. /api/v1/shipments/{id}
    2. /api/v1/shipping/{id}
    """
    cust = _create_user(db, "ship_alias_cust", role="customer")
    headers = _auth_headers(cust, is_admin=False)

    order = Order(
        id=uuid.uuid4(),
        user_id=cust.id,
        order_number=f"VNP-ORD-{uuid.uuid4().hex[:6]}",
        total_amount=100000,
        total_paise=100000,
        status="shipped",
    )
    db.add(order)
    db.flush()

    shipment = Shipment(
        id=uuid.uuid4(),
        order_id=order.id,
        tracking_number="DELH_TEST_9999",
        carrier="Delhivery",
        status="in_transit",
        created_at=datetime.now(timezone.utc),
    )
    db.add(shipment)
    db.commit()

    # 1. Test /api/v1/shipping/{shipment_id}
    res_shipping = client.get(f"/api/v1/shipping/{shipment.id}", headers=headers)
    assert res_shipping.status_code == 200
    assert res_shipping.json()["data"]["id"] == str(shipment.id)
    assert res_shipping.json()["data"]["carrier"] == "Delhivery"

    # 2. Test /api/v1/shipments/{shipment_id} (Document 04 Section 19 Contract Path)
    res_shipments = client.get(f"/api/v1/shipments/{shipment.id}", headers=headers)
    assert res_shipments.status_code == 200
    assert res_shipments.json()["data"]["id"] == str(shipment.id)
    assert res_shipments.json()["data"]["tracking_number"] == "DELH_TEST_9999"

    # 3. Test tracking under /api/v1/shipments/{shipment_id}/tracking
    res_track = client.get(f"/api/v1/shipments/{shipment.id}/tracking", headers=headers)
    assert res_track.status_code == 200
    assert "events" in res_track.json()["data"]


def test_core_api_endpoints_health_and_responses(db: Session):
    """
    End-to-end verification of primary API groups across the platform:
    Catalog, Search, Addresses, Admin Analytics, Admin Audit.
    """
    # 1. Public catalog
    res = client.get("/api/v1/products")
    assert res.status_code == 200
    assert "data" in res.json()

    # 2. Autocomplete search
    res = client.get("/api/v1/search/autocomplete?q=micro")
    assert res.status_code == 200
    assert "data" in res.json()

    # 3. Shipping serviceability
    res = client.get("/api/v1/shipping/serviceability?pincode=500001")
    assert res.status_code == 200
    assert res.json()["data"]["pincode"] == "500001"
    assert "serviceable" in res.json()["data"]

    # 4. Admin Analytics & Audit Logs
    super_admin = _create_user(db, "core_super", role="SUPER_ADMIN", is_super=True)
    admin_hdr = _auth_headers(super_admin, is_admin=True)

    res_an = client.get("/api/v1/admin/analytics", headers=admin_hdr)
    assert res_an.status_code == 200
    assert "total_revenue_paise" in res_an.json()["data"]

    res_aud = client.get("/api/v1/admin/audit-logs", headers=admin_hdr)
    assert res_aud.status_code == 200
    assert "data" in res_aud.json()


def test_admin_dashboard_finance_and_support_roles(db: Session):
    """
    Verify ADMIN-DASH-API-001 role scoping for FINANCE_MANAGER and SUPPORT_EXECUTIVE.
    """
    # 1. FINANCE_MANAGER
    fin_admin = _create_user(db, "dash_fin", role="FINANCE_MANAGER")
    res_fin = client.get("/api/v1/admin/dashboard", headers=_auth_headers(fin_admin, is_admin=True))
    assert res_fin.status_code == 200
    data_fin = res_fin.json()["data"]
    assert "pending_payment_verifications" in data_fin["queues"]
    assert "refunds_to_process" in data_fin["queues"]
    assert "total_revenue_paise" in data_fin["headline_metrics"]
    assert "new_requests_awaiting_review" not in data_fin["queues"]

    # 2. SUPPORT_EXECUTIVE
    sup_admin = _create_user(db, "dash_sup", role="SUPPORT_EXECUTIVE")
    res_sup = client.get("/api/v1/admin/dashboard", headers=_auth_headers(sup_admin, is_admin=True))
    assert res_sup.status_code == 200
    data_sup = res_sup.json()["data"]
    assert "flagged_reviews" in data_sup["queues"]
    assert "flagged_reviews_count" in data_sup["headline_metrics"]
    assert "new_orders" not in data_sup["queues"]


def test_service_requests_and_projects_contract_lifecycle(db: Session):
    """
    Verify customer service request submission and project creation contract.
    """
    cust = _create_user(db, "svc_cust", role="customer")
    headers = _auth_headers(cust, is_admin=False)

    # 1. Create Project (PROJECT-API-002)
    res_proj = client.post("/api/v1/projects", json={"name": "Antigravity Project", "description": "Hardware R&D"}, headers=headers)
    assert res_proj.status_code in (200, 201)
    proj_id = res_proj.json()["data"]["id"]

    # 2. Submit Manufacturing Request (MFG-API-001)
    res_mfg = client.post("/api/v1/manufacturing/requests", json={
        "title": "Edge Compute Carrier Board",
        "project_overview": "Custom carrier board for Raspberry Pi CM4",
        "prototype_type": "pcb_assembly",
        "quantity": 5,
        "project_id": proj_id,
    }, headers=headers)
    assert res_mfg.status_code in (200, 201)
    mfg_id = res_mfg.json()["data"]["id"]

    # 3. Retrieve Customer Request Detail (MFG-API-003)
    res_detail = client.get(f"/api/v1/manufacturing/requests/{mfg_id}", headers=headers)
    assert res_detail.status_code == 200
    assert res_detail.json()["data"]["id"] == mfg_id

    # 4. List Customer Requests (MFG-API-002)
    res_list = client.get("/api/v1/manufacturing/requests", headers=headers)
    assert res_list.status_code == 200
    assert len(res_list.json()["data"]) >= 1
