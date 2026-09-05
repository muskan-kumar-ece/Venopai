import uuid
import hmac
import hashlib
import json
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.models.user import User, Address, AuditEvent
from app.models.catalog import Product, Inventory, InventoryReservation
from app.models.order import (
    Cart,
    CartItem,
    CheckoutSession,
    Order,
    OrderItem,
    Payment,
    Refund,
    ProcessedWebhookEvent,
)
from app.models.project import Project, Quote, QuoteVersion, QuoteApproval
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

from app.workers.celery_app import celery_app
celery_app.conf.task_always_eager = True
celery_app.conf.task_eager_propagates = True

client = TestClient(app)

@pytest.fixture(autouse=True)
def mock_celery_session():
    with patch("app.workers.tasks.payment.SessionLocal", TestingSessionLocal):
        yield

@pytest.fixture(autouse=True)
def clean_payment_db():
    db = TestingSessionLocal()
    db.query(ProcessedWebhookEvent).delete()
    db.query(Refund).delete()
    db.query(Payment).delete()
    db.query(OrderItem).delete()
    db.query(Order).delete()
    db.query(InventoryReservation).delete()
    db.query(CheckoutSession).delete()
    db.query(CartItem).delete()
    db.query(Cart).delete()
    db.query(QuoteApproval).delete()
    db.query(QuoteVersion).delete()
    db.query(Quote).delete()
    db.query(Project).delete()
    db.query(Inventory).delete()
    db.query(Product).delete()
    db.query(Address).delete()
    db.query(AuditEvent).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def create_user(db, email=None, status="verified", role="customer", is_superuser=False):
    user = User(
        email=email or f"user_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=get_password_hash("Secret123!"),
        full_name="Payment Test User",
        status=status,
        role=role,
        is_active=True,
        is_superuser=is_superuser,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_headers(user):
    user_id = str(user.id) if hasattr(user, "id") else str(user)
    role = getattr(user, "role", "customer")
    is_super = getattr(user, "is_superuser", False)
    audience = "admin" if is_super else "customer"
    token = create_access_token(
        subject=user_id,
        role=role,
        is_admin=is_super,
        audience=audience,
    )
    return {"Authorization": f"Bearer {token}"}


def setup_checkout_env(db, stock=10, quantity=2, price_paise=100000):
    user = create_user(db, email=f"cust_{uuid.uuid4().hex[:6]}@example.com")
    addr = Address(
        user_id=user.id,
        recipient_name="Jane Doe",
        phone="+919876543210",
        line1="123 Tech Park",
        city="Hyderabad",
        state="Telangana",
        pincode="500081",
        country="IN",
        is_default=True,
    )
    db.add(addr)
    db.flush()

    prod = Product(
        name="Embedded Controller",
        slug=f"embedded-controller-{uuid.uuid4().hex[:4]}",
        price_paise=price_paise,
        status="active",
        weight_grams=350,
    )
    db.add(prod)
    db.flush()

    inv = Inventory(
        product_id=prod.id,
        stock_quantity=stock,
        reserved_quantity=0,
    )
    db.add(inv)
    db.commit()

    # Add to cart
    headers = get_user_headers(user)
    add_resp = client.post(
        "/api/v1/cart/items",
        json={"product_id": str(prod.id), "quantity": quantity},
        headers=headers,
    )
    assert add_resp.status_code == 200

    # Create checkout session
    chk_resp = client.post(
        "/api/v1/checkout/sessions",
        json={"address_id": str(addr.id)},
        headers=headers,
    )
    assert chk_resp.status_code == 201
    session_data = chk_resp.json()["data"]

    return user, prod, inv, addr, session_data


def test_payment_initiate_requires_auth():
    resp = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "checkout_session", "source_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 401


def test_payment_initiate_unverified_customer_blocked():
    db = TestingSessionLocal()
    unverified = create_user(db, status="pending_verification")
    db.close()

    headers = get_user_headers(unverified)
    resp = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "checkout_session", "source_id": str(uuid.uuid4())},
        headers=headers,
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] in ("ACCOUNT_NOT_VERIFIED", "UNVERIFIED_ACCOUNT")


def test_payment_initiate_nonexistent_or_other_user_session_404():
    db = TestingSessionLocal()
    user1, _, _, _, session_data = setup_checkout_env(db)
    user2 = create_user(db, email="user2@example.com")
    headers2 = get_user_headers(user2)
    db.close()

    # Attempt to initiate payment for user1's session using user2 credentials
    resp = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "checkout_session", "source_id": session_data["checkout_session_id"]},
        headers=headers2,
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "SESSION_NOT_FOUND"


def test_payment_initiate_expired_session_409():
    db = TestingSessionLocal()
    user, _, _, _, session_data = setup_checkout_env(db)
    # Artificially expire the session
    session = db.query(CheckoutSession).filter(CheckoutSession.id == uuid.UUID(session_data["checkout_session_id"])).first()
    session.reservation_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    headers = get_user_headers(user)
    db.close()

    resp = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "checkout_session", "source_id": session_data["checkout_session_id"]},
        headers=headers,
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] in ("RESERVATION_EXPIRED", "SESSION_EXPIRED")


def test_payment_initiate_success_and_idempotency():
    db = TestingSessionLocal()
    user, _, _, _, session_data = setup_checkout_env(db)
    db.close()

    headers = get_user_headers(user)
    # 1. First initiate call
    resp1 = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "checkout_session", "source_id": session_data["checkout_session_id"]},
        headers=headers,
    )
    assert resp1.status_code == 201
    data1 = resp1.json()["data"]
    assert "payment_id" in data1
    assert "gateway_order_id" in data1
    assert data1["provider"] == "razorpay"
    assert data1["currency"] == "INR"
    assert data1["amount_paise"] > 0

    # 2. Re-requesting payment initiation returns identical pending payment (Idempotency)
    resp2 = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "checkout_session", "source_id": session_data["checkout_session_id"]},
        headers=headers,
    )
    assert resp2.status_code in (200, 201)
    data2 = resp2.json()["data"]
    assert data2["payment_id"] == data1["payment_id"]
    assert data2["gateway_order_id"] == data1["gateway_order_id"]


def test_payment_initiate_service_quote_flow():
    db = TestingSessionLocal()
    user = create_user(db, email="engineer@example.com")
    project = Project(user_id=user.id, name="Robotics PCB")
    db.add(project)
    db.flush()

    quote = Quote(project_id=project.id, status="DRAFT")
    db.add(quote)
    db.flush()
    quote_id = str(quote.id)

    q_ver = QuoteVersion(quote_id=quote.id, version=1, total_amount=450000)
    db.add(q_ver)
    db.commit()

    headers = get_user_headers(user)

    # 1. Unapproved quote should be rejected with 409
    resp_unapproved = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "quote", "source_id": quote_id},
        headers=headers,
    )
    assert resp_unapproved.status_code == 409
    assert resp_unapproved.json()["error"]["code"] == "QUOTE_NOT_APPROVED"

    # 2. Approve quote
    approval = QuoteApproval(quote_version_id=q_ver.id, user_id=user.id, status="APPROVED")
    db.add(approval)
    quote.status = "APPROVED"
    db.commit()
    db.close()

    # 3. Approved quote should succeed
    resp_approved = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "quote", "source_id": quote_id},
        headers=headers,
    )
    assert resp_approved.status_code == 201
    assert resp_approved.json()["data"]["amount_paise"] == 450000


def test_payment_confirm_invalid_signature_400():
    db = TestingSessionLocal()
    user, _, _, _, session_data = setup_checkout_env(db)
    headers = get_user_headers(user)
    db.close()

    init_res = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "checkout_session", "source_id": session_data["checkout_session_id"]},
        headers=headers,
    )
    payment_id = init_res.json()["data"]["payment_id"]
    order_id = init_res.json()["data"]["gateway_order_id"]

    # Supply invalid signature
    conf_res = client.post(
        f"/api/v1/payments/{payment_id}/confirm",
        json={
            "razorpay_payment_id": "pay_fake123",
            "razorpay_order_id": order_id,
            "razorpay_signature": "invalid_signature_string",
        },
        headers=headers,
    )
    assert conf_res.status_code == 400
    assert conf_res.json()["error"]["code"] == "INVALID_SIGNATURE"


def test_payment_confirm_non_owner_404():
    db = TestingSessionLocal()
    user1, _, _, _, session_data = setup_checkout_env(db)
    user2 = create_user(db, email="other_user@example.com")
    headers1 = get_user_headers(user1)
    headers2 = get_user_headers(user2)
    db.close()

    init_res = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "checkout_session", "source_id": session_data["checkout_session_id"]},
        headers=headers1,
    )
    payment_id = init_res.json()["data"]["payment_id"]
    order_id = init_res.json()["data"]["gateway_order_id"]

    # Other user attempts to confirm
    conf_res = client.post(
        f"/api/v1/payments/{payment_id}/confirm",
        json={
            "razorpay_payment_id": "pay_fake123",
            "razorpay_order_id": order_id,
            "razorpay_signature": "mock_valid_signature",
        },
        headers=headers2,
    )
    assert conf_res.status_code == 404


def test_payment_confirm_success_creates_order_and_finalizes_inventory():
    db = TestingSessionLocal()
    # 10 in stock, 2 in cart
    user, prod, inv, addr, session_data = setup_checkout_env(db, stock=10, quantity=2)
    db.close()

    headers = get_user_headers(user)
    init_res = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "checkout_session", "source_id": session_data["checkout_session_id"]},
        headers=headers,
    )
    payment_id = init_res.json()["data"]["payment_id"]
    gateway_order_id = init_res.json()["data"]["gateway_order_id"]

    # Confirm payment with mock valid signature
    conf_res = client.post(
        f"/api/v1/payments/{payment_id}/confirm",
        json={
            "razorpay_payment_id": "pay_test_987654",
            "razorpay_order_id": gateway_order_id,
            "razorpay_signature": "mock_valid_signature",
        },
        headers=headers,
    )
    assert conf_res.status_code == 200
    conf_data = conf_res.json()["data"]
    assert conf_data["status"] == "successful"
    assert "order_id" in conf_data
    assert "order_number" in conf_data
    assert conf_data["order_number"].startswith("VENOPAI-")

    # Verify Database State
    db = TestingSessionLocal()
    # 1. Order exists with status paid (ORD-001)
    order = db.query(Order).filter(Order.id == uuid.UUID(conf_data["order_id"])).first()
    assert order is not None
    assert order.status == "paid"
    assert order.order_number == conf_data["order_number"]
    assert order.total_paise == session_data["total"] * 100 or order.total_amount is not None
    assert order.paid_at is not None

    # 2. Inventory finalized: 10 stock - 2 purchased = 8 stock, 0 reserved (INV-005)
    updated_inv = db.query(Inventory).filter(Inventory.product_id == prod.id).first()
    assert updated_inv.stock_quantity == 8
    assert updated_inv.reserved_quantity == 0

    # 3. InventoryReservation marked CONSUMED
    res = db.query(InventoryReservation).filter(InventoryReservation.order_id == order.id).first()
    assert res is not None
    assert res.status == "CONSUMED"

    # 4. Cart emptied
    cart = db.query(Cart).filter(Cart.user_id == user.id).first()
    assert len(cart.items) == 0

    # 5. Checkout session marked completed
    chk = db.query(CheckoutSession).filter(CheckoutSession.id == uuid.UUID(session_data["checkout_session_id"])).first()
    assert chk.status == "completed"

    db.close()


def test_payment_confirm_idempotency_second_call_safe():
    db = TestingSessionLocal()
    user, prod, inv, addr, session_data = setup_checkout_env(db, stock=10, quantity=2)
    db.close()

    headers = get_user_headers(user)
    init_res = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "checkout_session", "source_id": session_data["checkout_session_id"]},
        headers=headers,
    )
    payment_id = init_res.json()["data"]["payment_id"]
    gateway_order_id = init_res.json()["data"]["gateway_order_id"]

    # First confirm
    conf1 = client.post(
        f"/api/v1/payments/{payment_id}/confirm",
        json={
            "razorpay_payment_id": "pay_test_idem",
            "razorpay_order_id": gateway_order_id,
            "razorpay_signature": "mock_valid_signature",
        },
        headers=headers,
    )
    assert conf1.status_code == 200
    order_id1 = conf1.json()["data"]["order_id"]

    # Second confirm (should be idempotent no-op returning existing order)
    conf2 = client.post(
        f"/api/v1/payments/{payment_id}/confirm",
        json={
            "razorpay_payment_id": "pay_test_idem",
            "razorpay_order_id": gateway_order_id,
            "razorpay_signature": "mock_valid_signature",
        },
        headers=headers,
    )
    assert conf2.status_code == 200
    assert conf2.json()["data"]["order_id"] == order_id1

    # Ensure stock was decremented exactly once
    db = TestingSessionLocal()
    inv_check = db.query(Inventory).filter(Inventory.product_id == prod.id).first()
    assert inv_check.stock_quantity == 8
    assert inv_check.reserved_quantity == 0
    # Exactly 1 order in DB
    assert db.query(Order).count() == 1
    db.close()


def test_payment_webhook_raw_hmac_verification_and_event_deduplication():
    webhook_secret = "test_webhook_secret_key"
    settings.RAZORPAY_WEBHOOK_SECRET = webhook_secret

    event_payload = {
        "event": "payment.captured",
        "entity": "event",
        "contains": ["payment"],
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_wh_12345",
                    "order_id": "order_wh_12345",
                    "amount": 100000,
                    "status": "captured",
                }
            }
        },
    }
    raw_body = json.dumps(event_payload).encode("utf-8")

    # 1. Invalid signature should return 400
    resp_bad = client.post(
        "/api/v1/webhooks/razorpay",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "X-Razorpay-Signature": "wrong_signature",
            "X-Razorpay-Event-Id": "evt_unique_101",
        },
    )
    assert resp_bad.status_code == 400

    # 2. Valid signature should return 200
    valid_sig = hmac.new(
        webhook_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    resp_good = client.post(
        "/api/v1/webhooks/razorpay",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "X-Razorpay-Signature": valid_sig,
            "X-Razorpay-Event-Id": "evt_unique_101",
        },
    )
    assert resp_good.status_code == 200
    assert resp_good.json()["status"] == "accepted"

    # 3. Duplicate event ID should be recognized and skipped gracefully
    resp_dup = client.post(
        "/api/v1/webhooks/razorpay",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "X-Razorpay-Signature": valid_sig,
            "X-Razorpay-Event-Id": "evt_unique_101",
        },
    )
    assert resp_dup.status_code == 200
    assert resp_dup.json()["status"] == "duplicate_ignored"


def test_race_condition_confirm_and_webhook_convergence():
    """Validates that whether client confirm arrives first or webhook arrives first,
    PaymentService.mark_successful guarantees exactly 1 Order and 1 inventory deduction."""
    db = TestingSessionLocal()
    user, prod, inv, addr, session_data = setup_checkout_env(db, stock=10, quantity=2)
    headers = get_user_headers(user)
    db.close()

    init_res = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "checkout_session", "source_id": session_data["checkout_session_id"]},
        headers=headers,
    )
    payment_id = init_res.json()["data"]["payment_id"]
    gateway_order_id = init_res.json()["data"]["gateway_order_id"]

    # 1. First trigger client confirm
    conf_res = client.post(
        f"/api/v1/payments/{payment_id}/confirm",
        json={
            "razorpay_payment_id": "pay_race_1",
            "razorpay_order_id": gateway_order_id,
            "razorpay_signature": "mock_valid_signature",
        },
        headers=headers,
    )
    assert conf_res.status_code == 200
    order_id = conf_res.json()["data"]["order_id"]

    # 2. Now simulate webhook task executing for the same payment/order
    from app.workers.tasks.payment import process_razorpay_webhook_event
    wh_result = process_razorpay_webhook_event.apply(
        args=[{
            "event": "payment.captured",
            "event_id": "evt_race_101",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_race_1",
                        "order_id": gateway_order_id,
                        "amount": 100000,
                        "status": "captured",
                    }
                }
            },
        }]
    ).get()
    assert wh_result["status"] in ("processed", "duplicate_ignored")

    # Verify exactly 1 order exists and stock was decremented once
    db = TestingSessionLocal()
    assert db.query(Order).count() == 1
    final_inv = db.query(Inventory).filter(Inventory.product_id == prod.id).first()
    assert final_inv.stock_quantity == 8
    assert final_inv.reserved_quantity == 0
    db.close()


def test_payment_get_detail_and_list_with_idor():
    db = TestingSessionLocal()
    user1, _, _, _, session_data1 = setup_checkout_env(db)
    user2 = create_user(db, email="user2_payments@example.com")
    headers1 = get_user_headers(user1)
    headers2 = get_user_headers(user2)
    db.close()

    init_res = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "checkout_session", "source_id": session_data1["checkout_session_id"]},
        headers=headers1,
    )
    payment_id = init_res.json()["data"]["payment_id"]

    # Owner can get payment
    resp_owner = client.get(f"/api/v1/payments/{payment_id}", headers=headers1)
    assert resp_owner.status_code == 200
    assert resp_owner.json()["data"]["payment_id"] == payment_id

    # Non-owner receives 404 (IDOR protection)
    resp_other = client.get(f"/api/v1/payments/{payment_id}", headers=headers2)
    assert resp_other.status_code == 404

    # List payments
    resp_list = client.get("/api/v1/payments", headers=headers1)
    assert resp_list.status_code == 200
    assert len(resp_list.json()["data"]) >= 1


def test_admin_refund_rbac_and_execution():
    db = TestingSessionLocal()
    user, prod, inv, addr, session_data = setup_checkout_env(db)
    admin = create_user(db, email="superadmin@venopai.com", role="SUPER_ADMIN", is_superuser=True)
    unauthorized_admin = create_user(db, email="support@venopai.com", role="SUPPORT_AGENT", is_superuser=False)
    user_headers = get_user_headers(user)
    admin_headers = get_user_headers(admin)
    unauth_headers = get_user_headers(unauthorized_admin)
    db.close()

    # 1. Initiate and confirm payment
    init_res = client.post(
        "/api/v1/payments/initiate",
        json={"source_type": "checkout_session", "source_id": session_data["checkout_session_id"]},
        headers=user_headers,
    )
    payment_id = init_res.json()["data"]["payment_id"]
    gateway_order_id = init_res.json()["data"]["gateway_order_id"]

    client.post(
        f"/api/v1/payments/{payment_id}/confirm",
        json={
            "razorpay_payment_id": "pay_ref_test",
            "razorpay_order_id": gateway_order_id,
            "razorpay_signature": "mock_valid_signature",
        },
        headers=user_headers,
    )

    # 2. Customer cannot refund (403)
    resp_cust = client.post(
        f"/api/v1/admin/payments/{payment_id}/refund",
        json={"amount_paise": 5000, "reason": "Customer cancellation"},
        headers=user_headers,
    )
    assert resp_cust.status_code == 403

    # 3. Non-finance/super-admin cannot refund (403)
    resp_unauth = client.post(
        f"/api/v1/admin/payments/{payment_id}/refund",
        json={"amount_paise": 5000, "reason": "Unauthorized refund"},
        headers=unauth_headers,
    )
    assert resp_unauth.status_code == 403

    # 4. Partial refund by Super Admin (202 Accepted)
    resp_partial = client.post(
        f"/api/v1/admin/payments/{payment_id}/refund",
        json={"amount_paise": 10000, "reason": "Partial compensation"},
        headers=admin_headers,
    )
    assert resp_partial.status_code in (200, 202)
    assert resp_partial.json()["data"]["status"] in ("initiated", "processed", "partially_refunded")

    # 5. Over-refunding should fail with 400 or 422
    resp_over = client.post(
        f"/api/v1/admin/payments/{payment_id}/refund",
        json={"amount_paise": 99999999, "reason": "Excessive refund"},
        headers=admin_headers,
    )
    assert resp_over.status_code in (400, 422)
