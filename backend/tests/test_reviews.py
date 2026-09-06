import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.engagement import Review
from app.models.catalog import Product
from app.models.order import Order, OrderItem
from app.models.project import (
    ManufacturingRequest,
    DesignRequest,
    SoftwareRequest,
    ConsultationRequest,
)
from app.models.user import User, AuditEvent
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_db():
    db = TestingSessionLocal()
    db.query(AuditEvent).delete()
    db.query(Review).delete()
    db.query(OrderItem).delete()
    db.query(Order).delete()
    db.query(ManufacturingRequest).delete()
    db.query(DesignRequest).delete()
    db.query(SoftwareRequest).delete()
    db.query(ConsultationRequest).delete()
    db.query(Product).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def create_user(db, email="test@example.com", is_superuser=False, role="customer"):
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=get_password_hash("Pass123!"),
        full_name="Test User",
        is_active=True,
        is_superuser=is_superuser,
        role=role if is_superuser else None,
        status="verified",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        is_admin=is_superuser,
        audience="admin" if is_superuser else "customer",
    )
    return user, token


def create_product(db):
    product = Product(
        id=uuid.uuid4(),
        name="Test Product",
        slug=f"test-product-{uuid.uuid4().hex[:6]}",
        description="Test",
        price_paise=1000,
        status="active",
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def create_order_with_item(db, user, product, status="delivered"):
    order = Order(
        id=uuid.uuid4(),
        user_id=user.id,
        order_number=f"ORD-{uuid.uuid4().hex[:8].upper()}",
        status=status,
        subtotal_paise=1000,
        shipping_rate_paise=0,
        tax_amount_paise=0,
        total_paise=1000,
        total_amount=1000,
    )
    db.add(order)
    item = OrderItem(
        id=uuid.uuid4(),
        order_id=order.id,
        product_id=product.id,
        quantity=1,
        price_at_time_of_order=1000,
        unit_price_paise=1000,
        total_paise=1000,
    )
    db.add(item)
    db.commit()
    return order, item


def create_mfg_request(db, user, status="completed"):
    mfg = ManufacturingRequest(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Custom PCB Fabrication",
        project_overview="4-layer ENIG PCB prototype",
        prototype_type="pcb_assembly",
        quantity=5,
        status=status,
    )
    db.add(mfg)
    db.commit()
    db.refresh(mfg)
    return mfg


def create_design_request(db, user, status="completed"):
    design = DesignRequest(
        id=uuid.uuid4(),
        user_id=user.id,
        title="IoT Power Board Schematic",
        project_overview="Buck converter circuit",
        design_scope="pcb_layout",
        status=status,
    )
    db.add(design)
    db.commit()
    db.refresh(design)
    return design


def create_sw_request(db, user, status="completed"):
    sw = SoftwareRequest(
        id=uuid.uuid4(),
        user_id=user.id,
        title="ESP32 BLE Firmware",
        project_description="BLE telemetry driver",
        requirements="GATT profile and low power sleep",
        status=status,
    )
    db.add(sw)
    db.commit()
    db.refresh(sw)
    return sw


def create_consult_request(db, user, status="completed"):
    consult = ConsultationRequest(
        id=uuid.uuid4(),
        user_id=user.id,
        topic="High-Speed Impedance Review",
        description="Review 50-ohm trace calculations",
        status=status,
    )
    db.add(consult)
    db.commit()
    db.refresh(consult)
    return consult


# ---------------------------------------------------------------------------
# 1. ORDER ITEM REVIEWS
# ---------------------------------------------------------------------------

def test_order_item_review_success():
    """Delivered OrderItem owned by customer -> review succeeds."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)
    order, item = create_order_with_item(db, user, product, status="delivered")

    payload = {
        "target_type": "order_item",
        "target_id": str(item.id),
        "rating": 5,
        "text": "Excellent quality board and fast shipping.",
    }
    res = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["target_type"] == "order_item"
    assert data["target_id"] == str(item.id)
    assert data["product_id"] == str(product.id)
    assert data["rating"] == 5
    assert data["text"] == "Excellent quality board and fast shipping."
    assert data["comment"] == "Excellent quality board and fast shipping."


def test_order_item_review_non_delivered_returns_403():
    """Non-delivered OrderItem -> 403 NOT_ELIGIBLE."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)
    order, item = create_order_with_item(db, user, product, status="shipped")

    payload = {
        "target_type": "order_item",
        "target_id": str(item.id),
        "rating": 5,
        "text": "Haven't received yet",
    }
    res = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "NOT_ELIGIBLE"


def test_order_item_review_foreign_customer_returns_404():
    """Foreign customer's OrderItem -> 404."""
    db = TestingSessionLocal()
    user1, _ = create_user(db, "u1@test.com")
    user2, token2 = create_user(db, "u2@test.com")
    product = create_product(db)
    order, item = create_order_with_item(db, user1, product, status="delivered")

    payload = {
        "target_type": "order_item",
        "target_id": str(item.id),
        "rating": 4,
        "text": "Trying to review someone else's item",
    }
    res = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token2}"}, json=payload)
    assert res.status_code == 404


def test_order_item_review_duplicate_returns_409():
    """Duplicate review of same OrderItem -> 409."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)
    order, item = create_order_with_item(db, user, product, status="delivered")

    payload = {
        "target_type": "order_item",
        "target_id": str(item.id),
        "rating": 5,
        "text": "First review",
    }
    res1 = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res1.status_code == 201

    res2 = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res2.status_code == 409
    assert res2.json()["error"]["code"] == "REVIEW_ALREADY_EXISTS"


def test_order_item_different_items_same_customer_allowed():
    """Same customer may review different OrderItems independently."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    product1 = create_product(db)
    product2 = create_product(db)
    _, item1 = create_order_with_item(db, user, product1, status="delivered")
    _, item2 = create_order_with_item(db, user, product2, status="delivered")

    res1 = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json={
        "target_type": "order_item",
        "target_id": str(item1.id),
        "rating": 5,
        "text": "First item review",
    })
    assert res1.status_code == 201

    res2 = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json={
        "target_type": "order_item",
        "target_id": str(item2.id),
        "rating": 4,
        "text": "Second item review",
    })
    assert res2.status_code == 201


# ---------------------------------------------------------------------------
# 2. MANUFACTURING REVIEWS
# ---------------------------------------------------------------------------

def test_manufacturing_review_completed_success():
    """Completed manufacturing request -> review succeeds."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    mfg = create_mfg_request(db, user, status="completed")

    payload = {
        "target_type": "manufacturing_request",
        "target_id": str(mfg.id),
        "rating": 5,
        "text": "PCBs manufactured to exact IPC-A-610 Class 3 tolerances.",
    }
    res = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["target_type"] == "manufacturing_request"
    assert data["target_id"] == str(mfg.id)
    assert data["product_id"] is None
    assert data["rating"] == 5


def test_manufacturing_review_non_completed_returns_403():
    """Non-completed manufacturing request -> 403."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    mfg = create_mfg_request(db, user, status="in_execution")

    payload = {
        "target_type": "manufacturing_request",
        "target_id": str(mfg.id),
        "rating": 5,
        "text": "Too early to review",
    }
    res = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "NOT_ELIGIBLE"


def test_manufacturing_review_foreign_returns_404():
    """Foreign request -> 404."""
    db = TestingSessionLocal()
    user1, _ = create_user(db, "u1@test.com")
    user2, token2 = create_user(db, "u2@test.com")
    mfg = create_mfg_request(db, user1, status="completed")

    payload = {
        "target_type": "manufacturing_request",
        "target_id": str(mfg.id),
        "rating": 5,
        "text": "Attempting foreign review",
    }
    res = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token2}"}, json=payload)
    assert res.status_code == 404


def test_manufacturing_review_duplicate_returns_409():
    """Duplicate review of same request -> 409."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    mfg = create_mfg_request(db, user, status="completed")

    payload = {
        "target_type": "manufacturing_request",
        "target_id": str(mfg.id),
        "rating": 5,
        "text": "First review",
    }
    res1 = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res1.status_code == 201

    res2 = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res2.status_code == 409
    assert res2.json()["error"]["code"] == "REVIEW_ALREADY_EXISTS"


# ---------------------------------------------------------------------------
# 3. DESIGN, SOFTWARE, CONSULTATION REVIEWS
# ---------------------------------------------------------------------------

def test_design_review_lifecycle():
    """Completed design request succeeds; non-completed returns 403."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    
    # Non-completed -> 403
    incomplete_design = create_design_request(db, user, status="in_progress")
    res_fail = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json={
        "target_type": "design_request",
        "target_id": str(incomplete_design.id),
        "rating": 4,
        "text": "Early feedback",
    })
    assert res_fail.status_code == 403
    assert res_fail.json()["error"]["code"] == "NOT_ELIGIBLE"

    # Completed -> 201
    completed_design = create_design_request(db, user, status="completed")
    res_ok = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json={
        "target_type": "design_request",
        "target_id": str(completed_design.id),
        "rating": 5,
        "text": "Impeccable high-speed trace routing and thermal management.",
    })
    assert res_ok.status_code == 201
    assert res_ok.json()["data"]["target_type"] == "design_request"


def test_software_review_lifecycle():
    """Completed software request succeeds; non-completed returns 403."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    
    # Non-completed -> 403
    incomplete_sw = create_sw_request(db, user, status="submitted")
    res_fail = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json={
        "target_type": "software_request",
        "target_id": str(incomplete_sw.id),
        "rating": 4,
        "text": "Waiting on code",
    })
    assert res_fail.status_code == 403
    assert res_fail.json()["error"]["code"] == "NOT_ELIGIBLE"

    # Completed -> 201
    completed_sw = create_sw_request(db, user, status="completed")
    res_ok = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json={
        "target_type": "software_request",
        "target_id": str(completed_sw.id),
        "rating": 5,
        "text": "Robust firmware with thorough unit tests and documentation.",
    })
    assert res_ok.status_code == 201
    assert res_ok.json()["data"]["target_type"] == "software_request"


def test_consultation_review_lifecycle():
    """Completed consultation request succeeds; non-completed returns 403."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    
    # Non-completed -> 403
    incomplete_consult = create_consult_request(db, user, status="in_progress")
    res_fail = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json={
        "target_type": "consultation_request",
        "target_id": str(incomplete_consult.id),
        "rating": 4,
        "text": "Session pending",
    })
    assert res_fail.status_code == 403
    assert res_fail.json()["error"]["code"] == "NOT_ELIGIBLE"

    # Completed -> 201
    completed_consult = create_consult_request(db, user, status="completed")
    res_ok = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json={
        "target_type": "consultation_request",
        "target_id": str(completed_consult.id),
        "rating": 5,
        "text": "Clear DFM guidance saved us two fabrication turns.",
    })
    assert res_ok.status_code == 201
    assert res_ok.json()["data"]["target_type"] == "consultation_request"


# ---------------------------------------------------------------------------
# 4. REVIEW-API-002: GET /mine AND VERIFY /me ALIAS REMOVAL
# ---------------------------------------------------------------------------

def test_get_my_reviews_mine_and_verify_no_me_alias():
    """REVIEW-API-002: GET /api/v1/reviews/mine works; GET /api/v1/reviews/me is removed (404/405)."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    mfg = create_mfg_request(db, user, status="completed")

    client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json={
        "target_type": "manufacturing_request",
        "target_id": str(mfg.id),
        "rating": 5,
        "text": "Great service",
    })

    # Canonical endpoint works
    res_mine = client.get("/api/v1/reviews/mine", headers={"Authorization": f"Bearer {token}"})
    assert res_mine.status_code == 200
    assert len(res_mine.json()["data"]) == 1

    # Undocumented alias /me MUST NOT exist
    res_me = client.get("/api/v1/reviews/me", headers={"Authorization": f"Bearer {token}"})
    assert res_me.status_code in (404, 405)


# ---------------------------------------------------------------------------
# 5. MODERATION & VISIBILITY FILTERING (REVIEW-API-005)
# ---------------------------------------------------------------------------

def test_hidden_review_excluded_from_public_and_locked():
    """Hidden review -> excluded from public reviews; cannot be edited or deleted."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)
    _, item1 = create_order_with_item(db, user, product, status="delivered")

    res = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json={
        "target_type": "order_item",
        "target_id": str(item1.id),
        "rating": 5,
        "text": "Initial public review",
    })
    assert res.status_code == 201
    review_id = res.json()["data"]["id"]

    # Public reviews includes it
    pub1 = client.get(f"/api/v1/products/{product.id}/reviews")
    assert pub1.status_code == 200
    assert pub1.json()["review_count"] == 1
    assert pub1.json()["average_rating"] == 5.0

    # Hide review via DB or Admin API
    _, admin_token = create_user(db, "admin@test.com", is_superuser=True, role="SUPPORT_EXECUTIVE")
    hide_res = client.post(
        f"/api/v1/admin/reviews/{review_id}/hide",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Contains abusive content"},
    )
    assert hide_res.status_code == 200

    # 1. Excluded from public reviews
    pub2 = client.get(f"/api/v1/products/{product.id}/reviews")
    assert pub2.json()["review_count"] == 0
    assert pub2.json()["average_rating"] is None

    # 2. Cannot be edited by customer -> 400 REVIEW_MODERATED
    edit_res = client.patch(
        f"/api/v1/reviews/{review_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"rating": 3},
    )
    assert edit_res.status_code == 400
    assert edit_res.json()["error"]["code"] == "REVIEW_MODERATED"

    # 3. Cannot be deleted by customer -> 400 REVIEW_MODERATED
    del_res = client.delete(
        f"/api/v1/reviews/{review_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert del_res.status_code == 400
    assert del_res.json()["error"]["code"] == "REVIEW_MODERATED"


# ---------------------------------------------------------------------------
# 6. EDIT / DELETE 7-DAY WINDOW & IDOR
# ---------------------------------------------------------------------------

def test_review_edit_and_delete_within_window():
    """Author can edit and delete review within 7 days."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    mfg = create_mfg_request(db, user, status="completed")

    res = client.post("/api/v1/reviews", headers={"Authorization": f"Bearer {token}"}, json={
        "target_type": "manufacturing_request",
        "target_id": str(mfg.id),
        "rating": 4,
        "text": "Initial review",
    })
    review_id = res.json()["data"]["id"]

    # Edit within window
    edit_res = client.patch(
        f"/api/v1/reviews/{review_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"rating": 5, "text": "Updated to 5 stars"},
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["data"]["rating"] == 5
    assert edit_res.json()["data"]["text"] == "Updated to 5 stars"

    # Delete within window
    del_res = client.delete(f"/api/v1/reviews/{review_id}", headers={"Authorization": f"Bearer {token}"})
    assert del_res.status_code == 204


def test_review_edit_and_delete_outside_window_rejected():
    """Reviews older than 7 days cannot be edited or deleted."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)
    _, item = create_order_with_item(db, user, product, status="delivered")

    eight_days_ago = datetime.now(timezone.utc) - timedelta(days=8)
    review = Review(
        id=uuid.uuid4(),
        user_id=user.id,
        target_type="order_item",
        target_id=item.id,
        product_id=product.id,
        rating=4,
        comment="Old review",
        is_visible=True,
        created_at=eight_days_ago,
    )
    db.add(review)
    db.commit()

    # Edit outside window -> 400 EDIT_WINDOW_EXPIRED
    res_edit = client.patch(
        f"/api/v1/reviews/{review.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"rating": 5},
    )
    assert res_edit.status_code == 400
    assert res_edit.json()["error"]["code"] == "EDIT_WINDOW_EXPIRED"

    # Delete outside window -> 400 EDIT_WINDOW_EXPIRED
    res_del = client.delete(
        f"/api/v1/reviews/{review.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_del.status_code == 400
    assert res_del.json()["error"]["code"] == "EDIT_WINDOW_EXPIRED"


def test_review_idor_isolation():
    """Foreign customer cannot edit or delete another user's review (404)."""
    db = TestingSessionLocal()
    user1, _ = create_user(db, "u1@test.com")
    user2, token2 = create_user(db, "u2@test.com")
    mfg = create_mfg_request(db, user1, status="completed")

    review = Review(
        id=uuid.uuid4(),
        user_id=user1.id,
        target_type="manufacturing_request",
        target_id=mfg.id,
        rating=5,
        comment="User 1 review",
        is_visible=True,
    )
    db.add(review)
    db.commit()

    # User 2 edit attempt -> 404
    assert client.patch(
        f"/api/v1/reviews/{review.id}",
        headers={"Authorization": f"Bearer {token2}"},
        json={"rating": 1},
    ).status_code == 404

    # User 2 delete attempt -> 404
    assert client.delete(
        f"/api/v1/reviews/{review.id}",
        headers={"Authorization": f"Bearer {token2}"},
    ).status_code == 404


# ---------------------------------------------------------------------------
# 7. ADMIN REVIEW RBAC & AUDIT LOGGING
# ---------------------------------------------------------------------------

def test_admin_review_rbac():
    """Only SUPPORT_EXECUTIVE and SUPER_ADMIN may access admin review endpoints."""
    db = TestingSessionLocal()
    user, _ = create_user(db, "cust@test.com")
    mfg = create_mfg_request(db, user, status="completed")
    review = Review(
        id=uuid.uuid4(),
        user_id=user.id,
        target_type="manufacturing_request",
        target_id=mfg.id,
        rating=5,
        is_visible=True,
    )
    db.add(review)
    db.commit()

    # Allowed roles
    _, super_token = create_user(db, "super@test.com", is_superuser=True, role="SUPER_ADMIN")
    _, support_token = create_user(db, "support@test.com", is_superuser=True, role="SUPPORT_EXECUTIVE")
    assert client.get("/api/v1/admin/reviews", headers={"Authorization": f"Bearer {super_token}"}).status_code == 200
    assert client.get("/api/v1/admin/reviews", headers={"Authorization": f"Bearer {support_token}"}).status_code == 200

    # Disallowed admin roles
    _, mfg_token = create_user(db, "mfg@test.com", is_superuser=True, role="MANUFACTURING_MANAGER")
    _, order_token = create_user(db, "order@test.com", is_superuser=True, role="ORDER_MANAGER")
    _, fin_token = create_user(db, "fin@test.com", is_superuser=True, role="FINANCE_MANAGER")
    assert client.get("/api/v1/admin/reviews", headers={"Authorization": f"Bearer {mfg_token}"}).status_code == 403
    assert client.get("/api/v1/admin/reviews", headers={"Authorization": f"Bearer {order_token}"}).status_code == 403
    assert client.get("/api/v1/admin/reviews", headers={"Authorization": f"Bearer {fin_token}"}).status_code == 403


def test_admin_hide_and_restore_review():
    """Admin hide with reason and restore endpoints update visibility and record AuditEvents."""
    db = TestingSessionLocal()
    user, _ = create_user(db, "cust@test.com")
    mfg = create_mfg_request(db, user, status="completed")
    review = Review(
        id=uuid.uuid4(),
        user_id=user.id,
        target_type="manufacturing_request",
        target_id=mfg.id,
        rating=5,
        comment="Great service",
        is_visible=True,
    )
    db.add(review)
    db.commit()

    _, admin_token = create_user(db, "admin@test.com", is_superuser=True, role="SUPER_ADMIN")

    # Hide review
    res_hide = client.post(
        f"/api/v1/admin/reviews/{review.id}/hide",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Contains promotional URL"},
    )
    assert res_hide.status_code == 200
    assert res_hide.json()["data"]["is_visible"] is False

    # Restore review
    res_restore = client.post(
        f"/api/v1/admin/reviews/{review.id}/restore",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_restore.status_code == 200
    assert res_restore.json()["data"]["is_visible"] is True

    # Audit events created
    audits = db.query(AuditEvent).filter(AuditEvent.entity_id == review.id).all()
    actions = [a.action for a in audits]
    assert "review.hide" in actions
    assert "review.restore" in actions
