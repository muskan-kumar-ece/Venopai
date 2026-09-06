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

def create_user(db, email="test@example.com", is_superuser=False):
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=get_password_hash("Pass123!"),
        full_name="Test User",
        is_active=True,
        is_superuser=is_superuser
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(
        subject=str(user.id),
        role="admin" if is_superuser else "customer",
        is_admin=is_superuser,
        audience="admin" if is_superuser else "customer"
    )
    return user, token

def create_product(db):
    product = Product(
        id=uuid.uuid4(),
        name="Test Product",
        slug="test-product",
        description="Test",
        price_paise=1000,
        status="active"
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product

def test_create_review():
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)
    
    res = client.post(
        "/api/v1/reviews",
        headers={"Authorization": f"Bearer {token}"},
        json={"product_id": str(product.id), "rating": 5, "comment": "Great!"}
    )
    assert res.status_code == 201
    assert res.json()["data"]["rating"] == 5

def test_get_product_reviews():
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)
    
    # Create review
    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=4)
    db.add(review)
    db.commit()

    res = client.get(f"/api/v1/reviews/product/{product.id}")
    assert res.status_code == 200
    assert len(res.json()["data"]) == 1
    assert res.json()["data"][0]["rating"] == 4

def test_get_my_reviews():
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)
    
    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=4)
    db.add(review)
    db.commit()

    res = client.get("/api/v1/reviews/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert len(res.json()["data"]) == 1

def test_update_review():
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)
    
    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=3)
    db.add(review)
    db.commit()

    res = client.patch(
        f"/api/v1/reviews/{review.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"rating": 5, "comment": "Updated"}
    )
    assert res.status_code == 200
    assert res.json()["data"]["rating"] == 5

def test_delete_review():
    db = TestingSessionLocal()
    user, token = create_user(db)
    product = create_product(db)
    
    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=3)
    db.add(review)
    db.commit()

    res = client.delete(f"/api/v1/reviews/{review.id}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 204

def test_admin_get_all_reviews():
    db = TestingSessionLocal()
    user, _ = create_user(db, "customer@test.com")
    admin, admin_token = create_user(db, "admin@test.com", True)
    product = create_product(db)
    
    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=3)
    db.add(review)
    db.commit()

    res = client.get("/api/v1/admin/reviews", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert len(res.json()["data"]) == 1

def test_admin_delete_review():
    db = TestingSessionLocal()
    user, _ = create_user(db, "customer@test.com")
    admin, admin_token = create_user(db, "admin@test.com", True)
    product = create_product(db)
    
    review = Review(id=uuid.uuid4(), user_id=user.id, product_id=product.id, rating=3)
    db.add(review)
    db.commit()

    res = client.delete(f"/api/v1/admin/reviews/{review.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 204
