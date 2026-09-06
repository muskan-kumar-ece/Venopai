import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User, Address
from app.models.catalog import Product, Category
from app.models.order import Order, Payment
from app.models.project import (
    Project,
    Quote,
    QuoteVersion,
    ManufacturingRequest,
)
from app.models.engagement import Review, Notification
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_security_db():
    db = TestingSessionLocal()
    db.query(Notification).delete()
    db.query(Review).delete()
    db.query(QuoteVersion).delete()
    db.query(Quote).delete()
    db.query(Project).delete()
    db.query(ManufacturingRequest).delete()
    db.query(Payment).delete()
    db.query(Order).delete()
    db.query(Product).delete()
    db.query(Category).delete()
    db.query(Address).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def create_test_user(db, email, role="customer", is_superuser=False):
    user = User(
        email=email,
        hashed_password=get_password_hash("Secret123!"),
        full_name=f"User {email}",
        status="verified",
        role=role,
        is_active=True,
        is_superuser=is_superuser,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    u_id = user.id
    return u_id, role, is_superuser


def get_token_headers(user_tuple):
    u_id, role, is_superuser = user_tuple
    is_admin = role != "customer" or is_superuser
    aud = "admin" if is_admin else "customer"
    token = create_access_token(
        subject=str(u_id),
        role=role,
        is_admin=is_admin,
        audience=aud,
    )
    return {"Authorization": f"Bearer {token}"}


# =====================================================================
# SECTION 23: IDOR TESTS (10 CUSTOMER RESOURCES)
# =====================================================================

def test_idor_01_orders_isolation():
    db = TestingSessionLocal()
    alice = create_test_user(db, "alice_order@example.com")
    bob = create_test_user(db, "bob_order@example.com")
    order = Order(
        user_id=alice[0],
        order_number="ORD-ALICE-001",
        status="paid",
        subtotal_paise=100000,
        shipping_rate_paise=6000,
        tax_amount_paise=18000,
        total_paise=124000,
    )
    db.add(order)
    db.commit()
    o_id = str(order.id)
    db.close()

    headers_bob = get_token_headers(bob)
    res = client.get(f"/api/v1/orders/{o_id}", headers=headers_bob)
    assert res.status_code in (403, 404), f"Bob accessed Alice's order: {res.status_code}"


def test_idor_02_addresses_isolation():
    db = TestingSessionLocal()
    alice = create_test_user(db, "alice_addr@example.com")
    bob = create_test_user(db, "bob_addr@example.com")
    addr = Address(
        user_id=alice[0],
        recipient_name="Alice Recipient",
        phone="+919876543210",
        line1="Alice Street 1",
        city="Hyderabad",
        state="Telangana",
        pincode="500001",
        country="India",
    )
    db.add(addr)
    db.commit()
    addr_id = str(addr.id)
    db.close()

    headers_bob = get_token_headers(bob)
    res_del = client.delete(f"/api/v1/addresses/{addr_id}", headers=headers_bob)
    assert res_del.status_code in (403, 404)
    res_patch = client.patch(f"/api/v1/addresses/{addr_id}", json={"line1": "Hacked"}, headers=headers_bob)
    assert res_patch.status_code in (403, 404)


def test_idor_03_payments_isolation():
    db = TestingSessionLocal()
    alice = create_test_user(db, "alice_pay@example.com")
    bob = create_test_user(db, "bob_pay@example.com")
    pay = Payment(
        user_id=alice[0],
        amount=124000,
        currency="INR",
        status="successful",
    )
    db.add(pay)
    db.commit()
    pay_id = str(pay.id)
    db.close()

    headers_bob = get_token_headers(bob)
    res = client.get(f"/api/v1/payments/{pay_id}", headers=headers_bob)
    assert res.status_code in (403, 404)


def test_idor_04_quotes_isolation():
    db = TestingSessionLocal()
    alice = create_test_user(db, "alice_quote@example.com")
    bob = create_test_user(db, "bob_quote@example.com")
    quote = Quote(
        user_id=alice[0],
        request_type="manufacturing",
        request_id=uuid.uuid4(),
        status="sent",
    )
    db.add(quote)
    db.flush()
    qv = QuoteVersion(
        quote_id=quote.id,
        version=1,
        subtotal_paise=100000,
        tax_paise=18000,
        total_amount=118000,
        valid_until=datetime.now(timezone.utc) + timedelta(days=7),
        line_items="[]",
    )
    db.add(qv)
    db.commit()
    q_id = str(quote.id)
    db.close()

    headers_bob = get_token_headers(bob)
    res = client.get(f"/api/v1/quotes/{q_id}", headers=headers_bob)
    assert res.status_code in (403, 404)


def test_idor_05_service_requests_isolation():
    db = TestingSessionLocal()
    alice = create_test_user(db, "alice_mfg@example.com")
    bob = create_test_user(db, "bob_mfg@example.com")
    mfg = ManufacturingRequest(
        user_id=alice[0],
        title="Custom PCB",
        project_overview="High speed board",
        prototype_type="pcb_assembly",
        quantity=10,
        status="submitted",
    )
    db.add(mfg)
    db.commit()
    mfg_id = str(mfg.id)
    db.close()

    headers_bob = get_token_headers(bob)
    res = client.get(f"/api/v1/manufacturing/requests/{mfg_id}", headers=headers_bob)
    assert res.status_code in (403, 404)


def test_idor_06_projects_isolation():
    db = TestingSessionLocal()
    alice = create_test_user(db, "alice_proj@example.com")
    bob = create_test_user(db, "bob_proj@example.com")
    proj = Project(
        user_id=alice[0],
        name="Alice Autonomous Drone",
    )
    db.add(proj)
    db.commit()
    p_id = str(proj.id)
    db.close()

    headers_bob = get_token_headers(bob)
    res_get = client.get(f"/api/v1/projects/{p_id}", headers=headers_bob)
    assert res_get.status_code in (403, 404)
    res_patch = client.patch(f"/api/v1/projects/{p_id}", json={"name": "Hacked"}, headers=headers_bob)
    assert res_patch.status_code in (403, 404)


def test_idor_07_project_files_isolation():
    db = TestingSessionLocal()
    alice = create_test_user(db, "alice_pfiles@example.com")
    bob = create_test_user(db, "bob_pfiles@example.com")
    proj = Project(
        user_id=alice[0],
        name="Alice Enclosure",
    )
    db.add(proj)
    db.commit()
    p_id = str(proj.id)
    db.close()

    headers_bob = get_token_headers(bob)
    res = client.get(f"/api/v1/projects/{p_id}/files", headers=headers_bob)
    assert res.status_code in (403, 404)


def test_idor_08_reviews_edit_isolation():
    db = TestingSessionLocal()
    alice = create_test_user(db, "alice_rev@example.com")
    bob = create_test_user(db, "bob_rev@example.com")
    prod = Product(name="Rev Product", slug="rev-prod-01", price_paise=50000, status="active")
    db.add(prod)
    db.flush()
    rev = Review(
        user_id=alice[0],
        product_id=prod.id,
        target_type="product",
        target_id=prod.id,
        rating=5,
        comment="Excellent PCB",
        is_visible=True,
    )
    db.add(rev)
    db.commit()
    rev_id = str(rev.id)
    db.close()

    headers_bob = get_token_headers(bob)
    res_patch = client.patch(f"/api/v1/reviews/{rev_id}", json={"rating": 1, "comment": "Compromised"}, headers=headers_bob)
    assert res_patch.status_code in (403, 404)
    res_del = client.delete(f"/api/v1/reviews/{rev_id}", headers=headers_bob)
    assert res_del.status_code in (403, 404)


def test_idor_09_notifications_isolation():
    db = TestingSessionLocal()
    alice = create_test_user(db, "alice_notif@example.com")
    bob = create_test_user(db, "bob_notif@example.com")
    notif = Notification(
        user_id=alice[0],
        title="Secret Alice Alert",
        message="Confidential manufacturing update",
    )
    db.add(notif)
    db.commit()
    db.close()

    headers_bob = get_token_headers(bob)
    res = client.get("/api/v1/notifications", headers=headers_bob)
    assert res.status_code == 200
    items = res.json()["data"]
    alice_titles = [i["title"] for i in items if i["title"] == "Secret Alice Alert"]
    assert len(alice_titles) == 0, "Bob saw Alice's notification in his history!"


def test_idor_10_invoice_download_isolation():
    db = TestingSessionLocal()
    alice = create_test_user(db, "alice_inv@example.com")
    bob = create_test_user(db, "bob_inv@example.com")
    order = Order(
        user_id=alice[0],
        order_number="ORD-ALICE-INV-001",
        status="delivered",
        subtotal_paise=100000,
        shipping_rate_paise=6000,
        tax_amount_paise=18000,
        total_paise=124000,
    )
    db.add(order)
    db.commit()
    o_id = str(order.id)
    db.close()

    headers_bob = get_token_headers(bob)
    res = client.get(f"/api/v1/orders/{o_id}/invoice", headers=headers_bob)
    assert res.status_code in (403, 404), "Bob accessed Alice's invoice!"


# =====================================================================
# SECTION 24: ADMIN RBAC TESTS (5 CANONICAL ROLES + CUSTOMER + ANON)
# =====================================================================

def test_rbac_catalog_and_inventory_gate():
    """Catalog and Inventory: ORDER_MANAGER and SUPER_ADMIN only.
    MANUFACTURING_MANAGER, FINANCE_MANAGER, SUPPORT_EXECUTIVE, CUSTOMER -> 403.
    """
    db = TestingSessionLocal()
    super_admin = create_test_user(db, "sa_cat@example.com", role="SUPER_ADMIN", is_superuser=True)
    order_mgr = create_test_user(db, "om_cat@example.com", role="ORDER_MANAGER")
    mfg_mgr = create_test_user(db, "mm_cat@example.com", role="MANUFACTURING_MANAGER")
    fin_mgr = create_test_user(db, "fm_cat@example.com", role="FINANCE_MANAGER")
    supp_exec = create_test_user(db, "se_cat@example.com", role="SUPPORT_EXECUTIVE")
    customer = create_test_user(db, "cust_cat@example.com", role="customer")
    db.close()

    h_sa = get_token_headers(super_admin)
    h_om = get_token_headers(order_mgr)
    h_mm = get_token_headers(mfg_mgr)
    h_fm = get_token_headers(fin_mgr)
    h_se = get_token_headers(supp_exec)
    h_cust = get_token_headers(customer)

    # Allowed: SUPER_ADMIN, ORDER_MANAGER
    assert client.get("/api/v1/admin/products", headers=h_sa).status_code == 200
    assert client.get("/api/v1/admin/products", headers=h_om).status_code == 200

    # Forbidden (403):
    assert client.get("/api/v1/admin/products", headers=h_mm).status_code == 403
    assert client.get("/api/v1/admin/products", headers=h_fm).status_code == 403
    assert client.get("/api/v1/admin/products", headers=h_se).status_code == 403
    assert client.get("/api/v1/admin/products", headers=h_cust).status_code == 403

    # Unauthenticated -> 401
    assert client.get("/api/v1/admin/products").status_code == 401


def test_rbac_review_moderation_gate():
    """Review Moderation: SUPPORT_EXECUTIVE and SUPER_ADMIN only.
    ORDER_MANAGER, MANUFACTURING_MANAGER, FINANCE_MANAGER, CUSTOMER -> 403.
    """
    db = TestingSessionLocal()
    super_admin = create_test_user(db, "sa_rev@example.com", role="SUPER_ADMIN", is_superuser=True)
    supp_exec = create_test_user(db, "se_rev@example.com", role="SUPPORT_EXECUTIVE")
    order_mgr = create_test_user(db, "om_rev@example.com", role="ORDER_MANAGER")
    mfg_mgr = create_test_user(db, "mm_rev@example.com", role="MANUFACTURING_MANAGER")
    fin_mgr = create_test_user(db, "fm_rev@example.com", role="FINANCE_MANAGER")
    customer = create_test_user(db, "cust_rev@example.com", role="customer")
    db.close()

    h_sa = get_token_headers(super_admin)
    h_se = get_token_headers(supp_exec)
    h_om = get_token_headers(order_mgr)
    h_mm = get_token_headers(mfg_mgr)
    h_fm = get_token_headers(fin_mgr)
    h_cust = get_token_headers(customer)

    # Allowed: SUPER_ADMIN, SUPPORT_EXECUTIVE
    assert client.get("/api/v1/admin/reviews", headers=h_sa).status_code == 200
    assert client.get("/api/v1/admin/reviews", headers=h_se).status_code == 200

    # Forbidden (403):
    assert client.get("/api/v1/admin/reviews", headers=h_om).status_code == 403
    assert client.get("/api/v1/admin/reviews", headers=h_mm).status_code == 403
    assert client.get("/api/v1/admin/reviews", headers=h_fm).status_code == 403
    assert client.get("/api/v1/admin/reviews", headers=h_cust).status_code == 403


def test_rbac_manufacturing_and_services_gate():
    """Manufacturing, Design, Software: MANUFACTURING_MANAGER and SUPER_ADMIN.
    ORDER_MANAGER, FINANCE_MANAGER, SUPPORT_EXECUTIVE -> 403.
    """
    db = TestingSessionLocal()
    super_admin = create_test_user(db, "sa_serv@example.com", role="SUPER_ADMIN", is_superuser=True)
    mfg_mgr = create_test_user(db, "mm_serv@example.com", role="MANUFACTURING_MANAGER")
    order_mgr = create_test_user(db, "om_serv@example.com", role="ORDER_MANAGER")
    fin_mgr = create_test_user(db, "fm_serv@example.com", role="FINANCE_MANAGER")
    supp_exec = create_test_user(db, "se_serv@example.com", role="SUPPORT_EXECUTIVE")
    db.close()

    h_sa = get_token_headers(super_admin)
    h_mm = get_token_headers(mfg_mgr)
    h_om = get_token_headers(order_mgr)
    h_fm = get_token_headers(fin_mgr)
    h_se = get_token_headers(supp_exec)

    # Allowed: SUPER_ADMIN, MANUFACTURING_MANAGER
    assert client.get("/api/v1/admin/manufacturing/requests", headers=h_sa).status_code == 200
    assert client.get("/api/v1/admin/manufacturing/requests", headers=h_mm).status_code == 200

    # Forbidden (403):
    assert client.get("/api/v1/admin/manufacturing/requests", headers=h_om).status_code == 403
    assert client.get("/api/v1/admin/manufacturing/requests", headers=h_fm).status_code == 403
    assert client.get("/api/v1/admin/manufacturing/requests", headers=h_se).status_code == 403


def test_rbac_refunds_finance_gate():
    """Refunds: FINANCE_MANAGER and SUPER_ADMIN.
    ORDER_MANAGER, MANUFACTURING_MANAGER, SUPPORT_EXECUTIVE, CUSTOMER -> 403.
    """
    db = TestingSessionLocal()
    super_admin = create_test_user(db, "sa_fin@example.com", role="SUPER_ADMIN", is_superuser=True)
    fin_mgr = create_test_user(db, "fm_fin@example.com", role="FINANCE_MANAGER")
    order_mgr = create_test_user(db, "om_fin@example.com", role="ORDER_MANAGER")
    mfg_mgr = create_test_user(db, "mm_fin@example.com", role="MANUFACTURING_MANAGER")
    supp_exec = create_test_user(db, "se_fin@example.com", role="SUPPORT_EXECUTIVE")
    db.close()

    h_sa = get_token_headers(super_admin)
    h_fm = get_token_headers(fin_mgr)
    h_om = get_token_headers(order_mgr)
    h_mm = get_token_headers(mfg_mgr)
    h_se = get_token_headers(supp_exec)

    dummy_pay_id = str(uuid.uuid4())
    # Forbidden (403):
    assert client.post(f"/api/v1/admin/payments/{dummy_pay_id}/refund", json={"amount_paise": 100, "reason": "test"}, headers=h_om).status_code == 403
    assert client.post(f"/api/v1/admin/payments/{dummy_pay_id}/refund", json={"amount_paise": 100, "reason": "test"}, headers=h_mm).status_code == 403
    assert client.post(f"/api/v1/admin/payments/{dummy_pay_id}/refund", json={"amount_paise": 100, "reason": "test"}, headers=h_se).status_code == 403

    # Authorized roles hit payment lookup (404 for non-existent dummy_pay_id, NOT 403 Forbidden)
    assert client.post(f"/api/v1/admin/payments/{dummy_pay_id}/refund", json={"amount_paise": 100, "reason": "test"}, headers=h_sa).status_code == 404
    assert client.post(f"/api/v1/admin/payments/{dummy_pay_id}/refund", json={"amount_paise": 100, "reason": "test"}, headers=h_fm).status_code == 404
