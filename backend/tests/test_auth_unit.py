from datetime import datetime, timezone, timedelta
import pytest
import jwt
from app.core.config import settings
from app.core.security import (
    verify_password,
    get_password_hash,
    hash_token,
    create_access_token,
    create_refresh_token,
    create_csrf_token,
)
from app.schemas.auth import validate_password_strength, validate_indian_phone

def test_password_hashing():
    pw = "SuperSecret123!"
    h = get_password_hash(pw)
    assert h != pw
    assert verify_password(pw, h) is True
    assert verify_password("WrongPw123!", h) is False

def test_password_strength_validator():
    # Min length 8, at least 1 letter, at least 1 number
    assert validate_password_strength("Valid123!") == "Valid123!"
    with pytest.raises(ValueError):
        validate_password_strength("short1!")
    with pytest.raises(ValueError):
        validate_password_strength("1234567890") # all digits, no letters
    with pytest.raises(ValueError):
        validate_password_strength("onlyletters") # no digits

def test_indian_phone_validator():
    assert validate_indian_phone("+919812345678") == "+919812345678"
    assert validate_indian_phone("9812345678") == "9812345678"
    assert validate_indian_phone(None) is None
    with pytest.raises(ValueError):
        validate_indian_phone("12345") # invalid length
    with pytest.raises(ValueError):
        validate_indian_phone("5123456789") # does not start with 6-9

def test_token_sha256_hashing():
    token = "random_opaque_token_string"
    h1 = hash_token(token)
    h2 = hash_token(token)
    assert h1 == h2
    assert len(h1) == 64
    assert hash_token("different") != h1

def test_jwt_access_token_creation_and_expiration():
    sub = "12345678-1234-5678-1234-567812345678"
    token = create_access_token(
        subject=sub,
        role="customer",
        is_admin=False,
        audience="customer",
        expires_delta=timedelta(minutes=15),
    )
    payload = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
        options={"verify_aud": False},
    )
    assert payload["sub"] == sub
    assert payload["aud"] == "customer"
    assert payload["is_admin"] is False
    assert payload["type"] == "access"

def test_jwt_admin_token_distinction():
    sub = "admin-1234"
    token = create_access_token(
        subject=sub,
        role="SUPER_ADMIN",
        is_admin=True,
        audience="admin",
    )
    payload = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
        options={"verify_aud": False},
    )
    assert payload["sub"] == sub
    assert payload["aud"] == "admin"
    assert payload["is_admin"] is True
    assert payload["role"] == "SUPER_ADMIN"

def test_csrf_and_refresh_tokens_generation():
    csrf = create_csrf_token()
    refresh = create_refresh_token()
    assert len(csrf) > 20
    assert len(refresh) > 40
    assert csrf != refresh
