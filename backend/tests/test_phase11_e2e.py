import uuid
import json
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.session import Base
from app.api.deps import get_db
from app.workers.celery_app import celery_app
from app.core.security import get_password_hash, create_access_token
from app.models.user import User, Address
from app.models.catalog import Product, Category, Inventory, InventoryReservation
from app.models.order import Order, OrderItem, Payment, Refund
from app.models.project import (
    ManufacturingRequest,
    DesignRequest,
    ConsultationRequest,
    SoftwareRequest,
    Project,
    ProjectFile,
    Quote,
    QuoteVersion,
    QuoteApproval,
)
from app.models.engagement import Review, Notification

celery_app.conf.task_always_eager = True
celery_app.conf.task_eager_propagates = True

from tests.test_utils import TestingSessionLocal
client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_database():
    yield
    db = TestingSessionLocal()
    try:
        db.query(Review).delete()
        db.query(Notification).delete()
        db.query(ProjectFile).delete()
        db.query(QuoteApproval).delete()
        db.query(QuoteVersion).delete()
        db.query(Quote).delete()
        db.query(SoftwareRequest).delete()
        db.query(ConsultationRequest).delete()
        db.query(DesignRequest).delete()
        db.query(ManufacturingRequest).delete()
        db.query(Project).delete()
        db.query(Refund).delete()
        db.query(Payment).delete()
        db.query(OrderItem).delete()
        db.query(Order).delete()
        db.query(InventoryReservation).delete()
        db.query(Inventory).delete()
        db.query(Product).delete()
        db.query(Category).delete()
        db.query(Address).delete()
        db.query(User).delete()
        db.commit()
    finally:
        db.close()


def create_user(db, email, role="CUSTOMER", is_superuser=False):
    user = User(
        email=email,
        hashed_password=get_password_hash("Secret123!"),
        full_name="E2E Tester",
        role=role,
        status="verified",
        is_active=True,
        is_superuser=(role == "SUPER_ADMIN" or is_superuser),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    user_id = user.id
    user_email = user.email
    user_role = user.role
    user_is_super = user.is_superuser
    return user_id, user_email, user_role, user_is_super


def get_headers(user_tuple):
    user_id, email, role, is_super = user_tuple
    is_admin = role in (
        "SUPER_ADMIN",
        "ORDER_MANAGER",
        "MANUFACTURING_MANAGER",
        "SUPPORT_EXECUTIVE",
        "FINANCE_MANAGER",
    )
    token = create_access_token(
        subject=str(user_id),
        role=role,
        is_admin=is_admin,
        audience="admin" if is_admin else "customer",
    )
    return {"Authorization": f"Bearer {token}"}


# =====================================================================
# JOURNEY 1: AUTHENTICATION & ACCOUNT (SECTION 8)
# =====================================================================
def test_journey_01_authentication_lifecycle():
    email = f"j1_{uuid.uuid4().hex[:6]}@example.com"
    # 1. Register
    reg_res = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Password123!",
        "full_name": "Journey One User",
    })
    assert reg_res.status_code == 201

    # 2. Login
    login_res = client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "Password123!",
    })
    assert login_res.status_code == 200
    access_token = login_res.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # 3. View profile
    me_res = client.get("/api/v1/users/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["data"]["email"] == email

    # 4. Update profile
    patch_res = client.patch("/api/v1/users/me", json={"full_name": "Updated J1 Name"}, headers=headers)
    assert patch_res.status_code == 200

    # 5. Logout
    logout_res = client.post("/api/v1/auth/logout", headers=headers)
    assert logout_res.status_code in (200, 204)


# =====================================================================
# JOURNEY 2: DIRECT COMMERCE (SECTION 9)
# =====================================================================
def test_journey_02_direct_commerce_flow():
    db = TestingSessionLocal()
    user = create_user(db, "j2_customer@example.com")
    headers = get_headers(user)

    # 1. Browse active product
    cat = Category(name="Electronics", slug="electronics")
    db.add(cat)
    db.flush()
    prod = Product(
        name="Microcontroller Dev Board",
        slug="mcu-dev-board",
        price_paise=120000,
        status="active",
        weight_grams=250,
    )
    db.add(prod)
    db.flush()
    inv = Inventory(product_id=prod.id, stock_quantity=10, reserved_quantity=0)
    db.add(inv)
    addr = Address(
        user_id=user[0],
        recipient_name="J2 Recipient",
        phone="+919876543210",
        line1="HiTech City",
        city="Hyderabad",
        state="Telangana",
        pincode="500081",
        country="India",
    )
    db.add(addr)
    db.commit()
    p_id = str(prod.id)
    addr_id = str(addr.id)
    db.close()

    # 2. Add to Cart
    cart_res = client.post("/api/v1/cart/items", json={"product_id": p_id, "quantity": 2}, headers=headers)
    assert cart_res.status_code == 200

    # 3. Checkout session (hard reservation)
    sess_res = client.post("/api/v1/checkout/sessions", json={"address_id": addr_id}, headers=headers)
    assert sess_res.status_code == 201
    session_id = sess_res.json()["data"]["checkout_session_id"]

    # 4. Payment initiation
    pay_init = client.post("/api/v1/payments/initiate", json={
        "source_type": "checkout_session",
        "source_id": session_id,
    }, headers=headers)
    assert pay_init.status_code in (200, 201)
    payment_id = pay_init.json()["data"]["payment_id"]
    gw_order_id = pay_init.json()["data"]["gateway_order_id"]

    # 5. Payment confirmation
    pay_conf = client.post(f"/api/v1/payments/{payment_id}/confirm", json={
        "razorpay_payment_id": f"pay_{uuid.uuid4().hex[:8]}",
        "razorpay_order_id": gw_order_id,
        "razorpay_signature": "mock_valid_signature",
    }, headers=headers)
    assert pay_conf.status_code == 200
    order_id = pay_conf.json()["data"]["order_id"]

    # 6. Fetch Order
    order_res = client.get(f"/api/v1/orders/{order_id}", headers=headers)
    assert order_res.status_code == 200
    assert order_res.json()["data"]["status"] == "paid"


# =====================================================================
# JOURNEY 3: PAYMENT LIFECYCLE & REFUND (SECTION 11 & 22)
# =====================================================================
def test_journey_03_payment_lifecycle_and_refund():
    db = TestingSessionLocal()
    user = create_user(db, "j3_pay@example.com")
    fin_mgr = create_user(db, "j3_fin@example.com", role="FINANCE_MANAGER")
    headers = get_headers(user)
    h_fin = get_headers(fin_mgr)

    pay = Payment(
        user_id=user[0],
        amount=50000,
        currency="INR",
        status="successful",
        razorpay_payment_id="pay_mock_j3_123",
    )
    db.add(pay)
    db.commit()
    pay_id = str(pay.id)
    db.close()

    # Finance Manager issues refund (Document 04 ADMIN-PAY-API-002: 200/202)
    ref_res = client.post(f"/api/v1/admin/payments/{pay_id}/refund", json={
        "amount_paise": 50000,
        "reason": "Customer cancellation agreement",
    }, headers=h_fin)
    assert ref_res.status_code in (200, 202)
    assert ref_res.json()["data"]["status"] in ("pending", "processed", "initiated")


# =====================================================================
# JOURNEY 4: MANUFACTURING SERVICE REQUEST (SECTION 13)
# =====================================================================
def test_journey_04_manufacturing_service_flow():
    db = TestingSessionLocal()
    user = create_user(db, "j4_mfg@example.com")
    headers = get_headers(user)
    db.close()

    # 1. Submit Manufacturing Request
    mfg_res = client.post("/api/v1/manufacturing/requests", json={
        "title": "Robotics Chassis CNC",
        "project_overview": "Precision Aluminium CNC milled chassis",
        "prototype_type": "cnc_machining",
        "quantity": 5,
        "technical_requirements": "Tolerance +/- 0.05mm",
    }, headers=headers)
    assert mfg_res.status_code == 201
    req_id = mfg_res.json()["data"]["id"]

    # 2. Get Request detail
    get_res = client.get(f"/api/v1/manufacturing/requests/{req_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["data"]["status"] == "submitted"


# =====================================================================
# JOURNEY 5: DESIGN SERVICE & START MANUFACTURING (SECTION 14)
# =====================================================================
def test_journey_05_design_service_convenience_draft():
    db = TestingSessionLocal()
    user = create_user(db, "j5_des@example.com")
    headers = get_headers(user)

    # Completed design request
    des = DesignRequest(
        user_id=user[0],
        title="High Density PCB Layout",
        project_overview="4-layer IoT Gateway board design",
        design_scope="pcb_layout",
        status="completed",
    )
    db.add(des)
    db.commit()
    des_id = str(des.id)
    db.close()

    # Call convenience action: "Start Manufacturing"
    start_mfg = client.post(f"/api/v1/design/requests/{des_id}/start-manufacturing", headers=headers)
    assert start_mfg.status_code == 200
    # Must return draft payload WITHOUT persisting a new request
    draft_data = start_mfg.json()["data"]
    assert draft_data["title"] is not None

    # Verify no ManufacturingRequest was auto-persisted
    db = TestingSessionLocal()
    mfg_count = db.query(ManufacturingRequest).filter(ManufacturingRequest.user_id == user[0]).count()
    assert mfg_count == 0, "Start Manufacturing must NOT auto-persist a ManufacturingRequest!"
    db.close()


# =====================================================================
# JOURNEY 6: SOFTWARE/FIRMWARE SERVICE REQUEST (SECTION 15)
# =====================================================================
def test_journey_06_software_service_flow():
    db = TestingSessionLocal()
    user = create_user(db, "j6_soft@example.com")
    headers = get_headers(user)
    db.close()

    soft_res = client.post("/api/v1/software/requests", json={
        "title": "ESP32 BLE Firmware",
        "project_description": "Low power BLE peripheral firmware with OTA and FreeRTOS",
        "requirements": "Implement BLE GATT services and FreeRTOS tasks",
        "platform_technology": "ESP32-WROOM-32E",
        "additional_notes": "Target hardware ESP32",
    }, headers=headers)
    assert soft_res.status_code == 201
    s_id = soft_res.json()["data"]["id"]

    get_soft = client.get(f"/api/v1/software/requests/{s_id}", headers=headers)
    assert get_soft.status_code == 200
    assert get_soft.json()["data"]["status"] == "submitted"


# =====================================================================
# JOURNEY 7: CONSULTATION REQUEST (SECTION 16)
# =====================================================================
def test_journey_07_consultation_flow():
    db = TestingSessionLocal()
    user = create_user(db, "j7_cons@example.com")
    headers = get_headers(user)
    db.close()

    cons_res = client.post("/api/v1/consultations", json={
        "topic": "Power Supply Architecture",
        "description": "Battery management system sizing and EMI compliance",
    }, headers=headers)
    assert cons_res.status_code == 201
    c_id = cons_res.json()["data"]["id"]

    get_cons = client.get(f"/api/v1/consultations/{c_id}", headers=headers)
    assert get_cons.status_code == 200
    assert get_cons.json()["data"]["status"] == "submitted"


# =====================================================================
# JOURNEY 8: QUOTE LIFECYCLE (SECTION 12)
# =====================================================================
def test_journey_08_quote_approval_and_payment():
    db = TestingSessionLocal()
    user = create_user(db, "j8_quote@example.com")
    headers = get_headers(user)

    proj = Project(name="Robotics Quote Project", user_id=user[0])
    db.add(proj)
    db.flush()

    quote = Quote(
        user_id=user[0],
        project_id=proj.id,
        request_type="manufacturing",
        request_id=uuid.uuid4(),
        status="sent",
    )
    db.add(quote)
    db.flush()
    qv = QuoteVersion(
        quote_id=quote.id,
        version=1,
        status="sent",
        subtotal_paise=200000,
        tax_paise=36000,
        total_amount=236000,
        valid_until=datetime.now(timezone.utc) + timedelta(days=7),
        line_items="[]",
    )
    db.add(qv)
    db.commit()
    q_id = str(quote.id)
    db.close()

    # Customer approves quote
    app_res = client.post(f"/api/v1/quotes/{q_id}/approve", json={"notes": "Approved by client"}, headers=headers)
    assert app_res.status_code == 200

    # Payment initiation enabled for approved quote
    pay_res = client.post("/api/v1/payments/initiate", json={
        "source_type": "quote",
        "source_id": q_id,
    }, headers=headers)
    assert pay_res.status_code in (200, 201)
    assert pay_res.json()["data"]["amount"] == "2360.00"


# =====================================================================
# JOURNEY 9: PROJECTS & FILE AGGREGATION (SECTION 17)
# =====================================================================
def test_journey_09_projects_aggregation():
    db = TestingSessionLocal()
    user = create_user(db, "j9_proj@example.com")
    headers = get_headers(user)
    db.close()

    # 1. Create Project
    p_res = client.post("/api/v1/projects", json={
        "name": "Smart Irrigation IoT Device",
        "description": "Full hardware and firmware stack",
    }, headers=headers)
    assert p_res.status_code == 201
    proj_id = p_res.json()["data"]["id"]

    # 2. Get Project detail
    get_proj = client.get(f"/api/v1/projects/{proj_id}", headers=headers)
    assert get_proj.status_code == 200
    assert get_proj.json()["data"]["name"] == "Smart Irrigation IoT Device"

    # 3. View aggregated files (initially empty)
    files_res = client.get(f"/api/v1/projects/{proj_id}/files", headers=headers)
    assert files_res.status_code == 200


# =====================================================================
# JOURNEY 10: PRIVATE FILE LIFECYCLE (SECTION 18)
# =====================================================================
def test_journey_10_file_security_and_scan_states():
    db = TestingSessionLocal()
    user = create_user(db, "j10_file@example.com")
    headers = get_headers(user)

    # 1. File in pending_scan
    f_pending = ProjectFile(
        owner_id=user[0],
        filename="gerber_pending.zip",
        storage_ref="venopai/files/test_1",
        scan_status="pending_scan",
    )
    # 2. File clean
    f_clean = ProjectFile(
        owner_id=user[0],
        filename="schematic_clean.pdf",
        storage_ref="venopai/files/test_2",
        scan_status="clean",
    )
    # 3. File flagged
    f_flagged = ProjectFile(
        owner_id=user[0],
        filename="malware_flagged.exe",
        storage_ref="venopai/files/test_3",
        scan_status="flagged",
    )
    db.add_all([f_pending, f_clean, f_flagged])
    db.commit()
    p_id = str(f_pending.id)
    c_id = str(f_clean.id)
    fl_id = str(f_flagged.id)
    db.close()

    # Download blocked for pending_scan (Document 04: 409 FILE_NOT_YET_AVAILABLE)
    res_p = client.get(f"/api/v1/files/{p_id}/download", headers=headers)
    assert res_p.status_code in (403, 409, 422)

    # Download permitted for clean (200 with signed URL)
    res_c = client.get(f"/api/v1/files/{c_id}/download", headers=headers)
    assert res_c.status_code == 200
    assert "download_url" in res_c.json()["data"]

    # Download blocked for flagged (Document 04: 410 FILE_FLAGGED)
    res_fl = client.get(f"/api/v1/files/{fl_id}/download", headers=headers)
    assert res_fl.status_code in (403, 410, 422)


# =====================================================================
# JOURNEY 11: NOTIFICATIONS PIPELINE (SECTION 19)
# =====================================================================
def test_journey_11_notification_pipeline():
    db = TestingSessionLocal()
    user = create_user(db, "j11_notif@example.com")
    headers = get_headers(user)

    notif = Notification(
        user_id=user[0],
        title="Shipment Dispatched",
        message="Your prototype package is out for delivery with tracking #TRK12345",
    )
    db.add(notif)
    db.commit()
    db.close()

    res = client.get("/api/v1/notifications", headers=headers)
    assert res.status_code == 200
    items = res.json()["data"]
    assert len(items) >= 1
    assert items[0]["title"] == "Shipment Dispatched"


# =====================================================================
# JOURNEY 12: SHIPPING & LOGISTICS (SECTION 20, SHIP-API-001)
# =====================================================================
def test_journey_12_shipping_and_serviceability():
    # 1. Serviceable pincode (SHIP-API-001)
    srv_res = client.get("/api/v1/shipping/serviceability?pincode=500001")
    assert srv_res.status_code == 200
    assert srv_res.json()["data"]["serviceable"] is True
    assert srv_res.json()["data"]["estimated_days_min"] > 0

    # 2. Known unserviceable pincode
    unsrv_res = client.get("/api/v1/shipping/serviceability?pincode=999999")
    assert unsrv_res.status_code == 200
    assert unsrv_res.json()["data"]["serviceable"] is False


# =====================================================================
# JOURNEY 13: CUSTOMER REVIEWS & MODERATION (SECTION 9 & 13)
# =====================================================================
def test_journey_13_reviews_and_moderation():
    db = TestingSessionLocal()
    user = create_user(db, "j13_rev@example.com")
    supp_exec = create_user(db, "j13_supp@example.com", role="SUPPORT_EXECUTIVE")
    headers = get_headers(user)
    h_supp = get_headers(supp_exec)

    prod = Product(name="CNC Milling Kit", slug="cnc-kit-13", price_paise=150000, status="active")
    db.add(prod)
    db.flush()

    # Completed order making user eligible
    order = Order(
        user_id=user[0],
        order_number="ORD-REV-ELIGIBLE-13",
        status="delivered",
        subtotal_paise=150000,
        total_paise=150000,
    )
    db.add(order)
    db.flush()
    item = OrderItem(
        order_id=order.id,
        product_id=prod.id,
        quantity=1,
        price_at_time_of_order=150000,
        unit_price_paise=150000,
        total_paise=150000,
    )
    db.add(item)
    db.commit()
    p_id = str(prod.id)
    item_id = str(item.id)
    db.close()

    # 1. Submit review
    rev_res = client.post("/api/v1/reviews", json={
        "target_type": "order_item",
        "target_id": item_id,
        "rating": 5,
        "comment": "Superb machining quality and fast turnaround!",
    }, headers=headers)
    assert rev_res.status_code == 201
    rev_id = rev_res.json()["data"]["id"]

    # 2. Public product reviews
    pub_res = client.get(f"/api/v1/products/{p_id}/reviews")
    assert pub_res.status_code == 200
    assert len(pub_res.json()["data"]) >= 1

    # 3. Support Executive hides review (moderation)
    hide_res = client.post(f"/api/v1/admin/reviews/{rev_id}/hide", json={
        "reason": "Suspected spam link",
    }, headers=h_supp)
    assert hide_res.status_code == 200

    # 4. Public reviews now empty
    pub_res2 = client.get(f"/api/v1/products/{p_id}/reviews")
    assert pub_res2.status_code == 200
    assert len(pub_res2.json()["data"]) == 0
