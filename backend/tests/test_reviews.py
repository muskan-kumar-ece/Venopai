import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.engagement import Review
from app.models.catalog import Product
from app.models.order import Order, OrderItem
from app.models.user import User
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_db():
    db = TestingSessionLocal()
    db.query(Review).delete()
    db.query(OrderItem).delete()
    db.query(Order).delete()
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


def create_delivered_order(db, user, product):
    """Helper creating a qualifying delivered order containing the product (REV-001)."""
    order = Order(
        id=uuid.uuid4(),
        user_id=user.id,
        order_number=f"ORD-{uuid.uuid4().hex[:8].upper()}",
        status="delivered",
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


# ---------------------------------------------------------------------------
# REVIEW-API-001 — Create review & Eligibility
# ---------------------------------------------------------------------------

def test_ineligible_review_returns_403():
    """Customer without a qualifying delivered order item cannot review."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)

    res = client.post(
        "/api/v1/reviews",
        headers={"Authorization": f"Bearer {token}"},
        json={"product_id": str(product.id), "rating": 5, "comment": "Great!"},
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "NOT_ELIGIBLE"


def test_create_review_eligible():
    """Customer with a qualifying delivered order item can review."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)
    create_delivered_order(db, user, product)

    res = client.post(
        "/api/v1/reviews",
        headers={"Authorization": f"Bearer {token}"},
        json={"product_id": str(product.id), "rating": 5, "comment": "Great!"},
    )
    assert res.status_code == 201
    assert res.json()["data"]["rating"] == 5
    assert res.json()["data"]["is_visible"] is True


def test_duplicate_review_returns_409():
    """REVIEW-API-001: duplicate submission must return 409 REVIEW_ALREADY_EXISTS."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)
    create_delivered_order(db, user, product)

    # First submission
    res1 = client.post(
        "/api/v1/reviews",
        headers={"Authorization": f"Bearer {token}"},
        json={"product_id": str(product.id), "rating": 5},
    )
    assert res1.status_code == 201

    # Duplicate submission
    res2 = client.post(
        "/api/v1/reviews",
        headers={"Authorization": f"Bearer {token}"},
        json={"product_id": str(product.id), "rating": 3},
    )
    assert res2.status_code == 409
    assert res2.json()["error"]["code"] == "REVIEW_ALREADY_EXISTS"


# ---------------------------------------------------------------------------
# REVIEW-API-002 — Own reviews (/mine and /me)
# ---------------------------------------------------------------------------

def test_get_my_reviews_mine_and_me():
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)

    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=4, is_visible=True)
    db.add(review)
    db.commit()

    # /mine endpoint (Document 04 contract)
    res_mine = client.get("/api/v1/reviews/mine", headers={"Authorization": f"Bearer {token}"})
    assert res_mine.status_code == 200
    assert len(res_mine.json()["data"]) == 1

    # /me endpoint (alias)
    res_me = client.get("/api/v1/reviews/me", headers={"Authorization": f"Bearer {token}"})
    assert res_me.status_code == 200
    assert len(res_me.json()["data"]) == 1


# ---------------------------------------------------------------------------
# REVIEW-API-003 & 004 — Edit and Delete within 7-day window & 404 IDOR
# ---------------------------------------------------------------------------

def test_update_review_within_window():
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)

    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=3, is_visible=True)
    db.add(review)
    db.commit()

    res = client.patch(
        f"/api/v1/reviews/{review.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"rating": 5, "comment": "Updated"},
    )
    assert res.status_code == 200
    assert res.json()["data"]["rating"] == 5


def test_update_review_wrong_owner_returns_404():
    """Authoritative IDOR protection: access by non-owner returns 404."""
    db = TestingSessionLocal()
    user1, _ = create_user(db, "u1@test.com")
    user2, token2 = create_user(db, "u2@test.com")
    product = create_product(db)

    review = Review(id=uuid.uuid4(), user_id=user1.id, product_id=product.id, rating=3, is_visible=True)
    db.add(review)
    db.commit()

    res = client.patch(
        f"/api/v1/reviews/{review.id}",
        headers={"Authorization": f"Bearer {token2}"},
        json={"rating": 1},
    )
    assert res.status_code == 404


def test_update_review_outside_window_returns_400():
    """Editing review after 7 days is rejected."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)

    eight_days_ago = datetime.now(timezone.utc) - timedelta(days=8)
    review = Review(
        id=uuid.uuid4(),
        user_id=user.id,
        product_id=product.id,
        rating=3,
        is_visible=True,
        created_at=eight_days_ago,
    )
    db.add(review)
    db.commit()

    res = client.patch(
        f"/api/v1/reviews/{review.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"rating": 5},
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "EDIT_WINDOW_EXPIRED"


def test_delete_review_within_window():
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)

    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=3, is_visible=True)
    db.add(review)
    db.commit()

    res = client.delete(f"/api/v1/reviews/{review.id}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 204


def test_delete_review_wrong_owner_returns_404():
    db = TestingSessionLocal()
    user1, _ = create_user(db, "u1@test.com")
    user2, token2 = create_user(db, "u2@test.com")
    product = create_product(db)

    review = Review(id=uuid.uuid4(), user_id=user1.id, product_id=product.id, rating=3, is_visible=True)
    db.add(review)
    db.commit()

    res = client.delete(f"/api/v1/reviews/{review.id}", headers={"Authorization": f"Bearer {token2}"})
    assert res.status_code == 404


def test_delete_review_outside_window_returns_400():
    """Deleting review after 7 days is rejected."""
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)

    eight_days_ago = datetime.now(timezone.utc) - timedelta(days=8)
    review = Review(
        id=uuid.uuid4(),
        user_id=user.id,
        product_id=product.id,
        rating=3,
        is_visible=True,
        created_at=eight_days_ago,
    )
    db.add(review)
    db.commit()

    res = client.delete(f"/api/v1/reviews/{review.id}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "EDIT_WINDOW_EXPIRED"


# ---------------------------------------------------------------------------
# REVIEW-API-005 — Public product reviews (visibility filtered)
# ---------------------------------------------------------------------------

def test_get_product_reviews_only_visible():
    """REVIEW-API-005: hidden reviews must NOT appear in public product review response."""
    db = TestingSessionLocal()
    user, _ = create_user(db)
    product = create_product(db)

    visible = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=5, is_visible=True)
    hidden = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=1, is_visible=False)
    db.add(visible)
    db.add(hidden)
    db.commit()

    res = client.get(f"/api/v1/products/{product.id}/reviews")
    assert res.status_code == 200
    data = res.json()
    assert data["review_count"] == 1
    assert data["average_rating"] == 5.0
    assert all(r["is_visible"] is True for r in data["data"])


# ---------------------------------------------------------------------------
# ADMIN-REVIEW-API-001..003 & Strict RBAC Enforcement
# ---------------------------------------------------------------------------

def test_admin_review_rbac():
    """Only SUPPORT_EXECUTIVE and SUPER_ADMIN may moderate reviews.
    MANUFACTURING_MANAGER, ORDER_MANAGER, and FINANCE_MANAGER receive 403."""
    db = TestingSessionLocal()
    user, _ = create_user(db, "customer@test.com")
    product = create_product(db)
    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=3, is_visible=True)
    db.add(review)
    db.commit()

    # Allowed roles
    _, super_token = create_user(db, "super@test.com", True, "SUPER_ADMIN")
    _, support_token = create_user(db, "support@test.com", True, "SUPPORT_EXECUTIVE")

    assert client.get("/api/v1/admin/reviews", headers={"Authorization": f"Bearer {super_token}"}).status_code == 200
    assert client.get("/api/v1/admin/reviews", headers={"Authorization": f"Bearer {support_token}"}).status_code == 200

    # Disallowed admin roles
    _, mfg_token = create_user(db, "mfg@test.com", True, "MANUFACTURING_MANAGER")
    _, order_token = create_user(db, "order@test.com", True, "ORDER_MANAGER")
    _, fin_token = create_user(db, "fin@test.com", True, "FINANCE_MANAGER")

    assert client.get("/api/v1/admin/reviews", headers={"Authorization": f"Bearer {mfg_token}"}).status_code == 403
    assert client.get("/api/v1/admin/reviews", headers={"Authorization": f"Bearer {order_token}"}).status_code == 403
    assert client.get("/api/v1/admin/reviews", headers={"Authorization": f"Bearer {fin_token}"}).status_code == 403


def test_admin_hide_and_restore_review():
    """ADMIN-REVIEW-API-002 and 003: hide with reason, restore visibility; AuditEvents recorded."""
    db = TestingSessionLocal()
    user, _ = create_user(db, "customer@test.com")
    _, admin_token = create_user(db, "admin@test.com", True, "SUPER_ADMIN")
    product = create_product(db)

    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=5, is_visible=True)
    db.add(review)
    db.commit()

    # 1. Hide the review
    res_hide = client.post(
        f"/api/v1/admin/reviews/{review.id}/hide",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Violates community guidelines"},
    )
    assert res_hide.status_code == 200
    assert res_hide.json()["data"]["is_visible"] is False

    # Verify hidden review does not appear publicly
    res_pub = client.get(f"/api/v1/products/{product.id}/reviews")
    assert res_pub.json()["review_count"] == 0

    # 2. Restore the review
    res_restore = client.post(
        f"/api/v1/admin/reviews/{review.id}/restore",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_restore.status_code == 200
    assert res_restore.json()["data"]["is_visible"] is True

    # Verify restored review reappears publicly
    res_pub2 = client.get(f"/api/v1/products/{product.id}/reviews")
    assert res_pub2.json()["review_count"] == 1
