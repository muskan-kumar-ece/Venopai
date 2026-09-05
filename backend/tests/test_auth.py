import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.session import Base
from app.api.deps import get_db
from app.models.user import User, RefreshToken

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

def test_register():
    response = client.post("/api/v1/auth/register", json={
        "email": "student@example.com",
        "password": "StrongPassword123!",
        "full_name": "Aarav Sharma",
        "phone": "+919812345678"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["data"]["email"] == "student@example.com"
    assert data["data"]["status"] == "registered"

def test_login():
    response = client.post("/api/v1/auth/login", json={
        "email": "student@example.com",
        "password": "StrongPassword123!"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data["data"]
    assert "refresh_token" in response.cookies

def test_me():
    login_response = client.post("/api/v1/auth/login", json={
        "email": "student@example.com",
        "password": "StrongPassword123!"
    })
    token = login_response.json()["data"]["access_token"]
    
    response = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["email"] == "student@example.com"

def test_refresh():
    login_response = client.post("/api/v1/auth/login", json={
        "email": "student@example.com",
        "password": "StrongPassword123!"
    })
    refresh_token = login_response.cookies.get("refresh_token")
    
    response = client.post("/api/v1/auth/refresh", cookies={"refresh_token": refresh_token})
    assert response.status_code == 200
    assert "access_token" in response.json()["data"]

def test_logout():
    login_response = client.post("/api/v1/auth/login", json={
        "email": "student@example.com",
        "password": "StrongPassword123!"
    })
    refresh_token = login_response.cookies.get("refresh_token")
    
    response = client.post("/api/v1/auth/logout", cookies={"refresh_token": refresh_token})
    assert response.status_code == 204
