import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User, Address
from app.core.security import get_password_hash, create_access_token
from tests.test_utils import TestingSessionLocal

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_address_db():
    db = TestingSessionLocal()
    db.query(Address).delete()
    db.query(User).delete()
    db.commit()
    db.close()


def create_customer(db, email=None, status="verified"):
    user = User(
        email=email or f"user_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=get_password_hash("Secret123!"),
        full_name="Test Customer",
        status=status,
        role="customer",
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_auth_headers(user: User):
    token = create_access_token(
        subject=str(user.id),
        role=user.role,
        is_admin=user.is_superuser,
        audience="customer",
    )
    return {"Authorization": f"Bearer {token}"}


def test_list_addresses_empty():
    db = TestingSessionLocal()
    user = create_customer(db)
    headers = get_auth_headers(user)
    db.close()

    res = client.get("/api/v1/addresses", headers=headers)
    assert res.status_code == 200
    assert res.json()["data"] == []


def test_create_address_success_and_first_is_default():
    db = TestingSessionLocal()
    user = create_customer(db)
    headers = get_auth_headers(user)
    db.close()

    payload = {
        "recipient_name": "Aarav Sharma",
        "phone": "+919812345678",
        "line1": "12 MG Road",
        "line2": "Near City Mall",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500001",
        "is_default": False, # First address should automatically become default
    }

    res = client.post("/api/v1/addresses", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["recipient_name"] == "Aarav Sharma"
    assert data["pincode"] == "500001"
    assert data["city"] == "Hyderabad"
    assert data["state"] == "Telangana"
    assert data["country"] == "India"
    assert data["is_default"] is True


def test_create_multiple_addresses_and_switch_default():
    db = TestingSessionLocal()
    user = create_customer(db)
    headers = get_auth_headers(user)
    db.close()

    # Address 1
    p1 = {
        "recipient_name": "Aarav Primary",
        "phone": "+919812345678",
        "line1": "12 MG Road",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500001",
        "is_default": True,
    }
    r1 = client.post("/api/v1/addresses", json=p1, headers=headers)
    a1_id = r1.json()["data"]["id"]

    # Address 2 marked default
    p2 = {
        "recipient_name": "Aarav Secondary",
        "phone": "+919812345678",
        "line1": "45 Jubilee Hills",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500033",
        "is_default": True,
    }
    r2 = client.post("/api/v1/addresses", json=p2, headers=headers)
    a2_id = r2.json()["data"]["id"]
    assert r2.json()["data"]["is_default"] is True

    # Check list: a2 is default, a1 is not default
    list_res = client.get("/api/v1/addresses", headers=headers)
    items = {item["id"]: item["is_default"] for item in list_res.json()["data"]}
    assert items[a2_id] is True
    assert items[a1_id] is False


def test_edit_address_and_idor_protection():
    db = TestingSessionLocal()
    user_a = create_customer(db, email="user_a@example.com")
    user_b = create_customer(db, email="user_b@example.com")
    headers_a = get_auth_headers(user_a)
    headers_b = get_auth_headers(user_b)
    db.close()

    r = client.post(
        "/api/v1/addresses",
        json={
            "recipient_name": "User A",
            "phone": "+919812345678",
            "line1": "Plot 10",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560001",
        },
        headers=headers_a,
    )
    a_id = r.json()["data"]["id"]

    # User A updates address
    patch_res = client.patch(
        f"/api/v1/addresses/{a_id}",
        json={"city": "Bangalore Urban"},
        headers=headers_a,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["data"]["city"] == "Bangalore Urban"

    # IDOR: User B attempts to edit User A's address -> 404 (not 403)
    idor_res = client.patch(
        f"/api/v1/addresses/{a_id}",
        json={"city": "Hacked City"},
        headers=headers_b,
    )
    assert idor_res.status_code == 404
    assert idor_res.json()["error"]["code"] == "ADDRESS_NOT_FOUND"


def test_delete_address_and_reassign_default():
    db = TestingSessionLocal()
    user = create_customer(db)
    headers = get_auth_headers(user)
    db.close()

    r1 = client.post(
        "/api/v1/addresses",
        json={
            "recipient_name": "Addr 1",
            "phone": "+919812345678",
            "line1": "Line 1",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "is_default": True,
        },
        headers=headers,
    )
    a1_id = r1.json()["data"]["id"]

    r2 = client.post(
        "/api/v1/addresses",
        json={
            "recipient_name": "Addr 2",
            "phone": "+919812345678",
            "line1": "Line 2",
            "city": "Secunderabad",
            "state": "Telangana",
            "pincode": "500003",
            "is_default": True,
        },
        headers=headers,
    )
    a2_id = r2.json()["data"]["id"]

    # Delete current default (a2)
    del_res = client.delete(f"/api/v1/addresses/{a2_id}", headers=headers)
    assert del_res.status_code == 200

    # Remaining address (a1) becomes default
    list_res = client.get("/api/v1/addresses", headers=headers)
    assert len(list_res.json()["data"]) == 1
    assert list_res.json()["data"][0]["id"] == a1_id
    assert list_res.json()["data"][0]["is_default"] is True


def test_delete_address_idor_protection():
    db = TestingSessionLocal()
    user_a = create_customer(db, email="alice@example.com")
    user_b = create_customer(db, email="bob@example.com")
    headers_a = get_auth_headers(user_a)
    headers_b = get_auth_headers(user_b)
    db.close()

    r = client.post(
        "/api/v1/addresses",
        json={
            "recipient_name": "Alice",
            "phone": "+919812345678",
            "line1": "Alice Line",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
        },
        headers=headers_a,
    )
    a_id = r.json()["data"]["id"]

    # User B attempts to delete Alice's address -> 404
    del_idor = client.delete(f"/api/v1/addresses/{a_id}", headers=headers_b)
    assert del_idor.status_code == 404
    assert del_idor.json()["error"]["code"] == "ADDRESS_NOT_FOUND"


def test_address_validation_failures():
    db = TestingSessionLocal()
    user = create_customer(db)
    headers = get_auth_headers(user)
    db.close()

    # Invalid phone
    bad_phone = {
        "recipient_name": "Test",
        "phone": "12345", # invalid
        "line1": "Road 1",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500001",
    }
    res = client.post("/api/v1/addresses", json=bad_phone, headers=headers)
    assert res.status_code == 422

    # Invalid pincode (non-digit or length != 6)
    bad_pin = {
        "recipient_name": "Test",
        "phone": "+919812345678",
        "line1": "Road 1",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "ABC123",
    }
    res2 = client.post("/api/v1/addresses", json=bad_pin, headers=headers)
    assert res2.status_code == 422
