import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.engagement import Review
from app.models.catalog import Product
from app.models.user import User
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_db():
    db = TestingSessionLocal()
    db.query(Review).delete()
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
        slug="test-product",
        description="Test",
        price_paise=1000,
        status="active",
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


# ---------------------------------------------------------------------------
# REVIEW-API-001 — Create review
# ---------------------------------------------------------------------------

def test_create_review():
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)

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

    # First submission
    client.post(
        "/api/v1/reviews",
        headers={"Authorization": f"Bearer {token}"},
        json={"product_id": str(product.id), "rating": 5},
    )
    # Duplicate
    res = client.post(
        "/api/v1/reviews",
        headers={"Authorization": f"Bearer {token}"},
        json={"product_id": str(product.id), "rating": 3},
    )
    assert res.status_code == 409


# ---------------------------------------------------------------------------
# REVIEW-API-002 — Own reviews
# ---------------------------------------------------------------------------

def test_get_my_reviews():
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)

    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=4, is_visible=True)
    db.add(review)
    db.commit()

    res = client.get("/api/v1/reviews/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert len(res.json()["data"]) == 1


# ---------------------------------------------------------------------------
# REVIEW-API-003 — Update review (ownership check)
# ---------------------------------------------------------------------------

def test_update_review():
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


def test_update_review_wrong_owner_returns_403():
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
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# REVIEW-API-004 — Delete review
# ---------------------------------------------------------------------------

def test_delete_review():
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)

    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=3, is_visible=True)
    db.add(review)
    db.commit()

    res = client.delete(f"/api/v1/reviews/{review.id}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 204


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
    # Different products needed since we now have unique constraint logic via duplicate check
    # For this test we directly insert both reviews bypassing the API
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
# ADMIN-REVIEW-API-001 — Admin moderation queue
# ---------------------------------------------------------------------------

def test_admin_get_all_reviews():
    db = TestingSessionLocal()
    user, _ = create_user(db, "customer@test.com")
    admin, admin_token = create_user(db, "admin@test.com", True, "SUPER_ADMIN")
    product = create_product(db)

    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=3, is_visible=True)
    db.add(review)
    db.commit()

    res = client.get("/api/v1/admin/reviews", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert len(res.json()["data"]) == 1


# ---------------------------------------------------------------------------
# ADMIN-REVIEW-API-002 — Hide review
# ---------------------------------------------------------------------------

def test_admin_hide_review():
    """ADMIN-REVIEW-API-002: admin can hide a review; hidden review must not appear in public endpoint."""
    db = TestingSessionLocal()
    user, _ = create_user(db, "customer@test.com")
    admin, admin_token = create_user(db, "admin@test.com", True, "SUPER_ADMIN")
    product = create_product(db)

    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=5, is_visible=True)
    db.add(review)
    db.commit()

    # Hide the review
    res_hide = client.post(
        f"/api/v1/admin/reviews/{review.id}/hide",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Violates community guidelines"},
    )
    assert res_hide.status_code == 200
    assert res_hide.json()["data"]["is_visible"] is False

    # Verify it no longer appears in public product reviews
    res_pub = client.get(f"/api/v1/products/{product.id}/reviews")
    assert res_pub.json()["review_count"] == 0


# ---------------------------------------------------------------------------
# ADMIN-REVIEW-API-003 — Restore review
# ---------------------------------------------------------------------------

def test_admin_restore_review():
    """ADMIN-REVIEW-API-003: admin can restore a hidden review back to visible."""
    db = TestingSessionLocal()
    user, _ = create_user(db, "customer@test.com")
    admin, admin_token = create_user(db, "admin@test.com", True, "SUPER_ADMIN")
    product = create_product(db)

    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=5, is_visible=False)
    db.add(review)
    db.commit()

    res = client.post(
        f"/api/v1/admin/reviews/{review.id}/restore",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200
    assert res.json()["data"]["is_visible"] is True

    # Verify it now appears in public product reviews
    res_pub = client.get(f"/api/v1/products/{product.id}/reviews")
    assert res_pub.json()["review_count"] == 1
