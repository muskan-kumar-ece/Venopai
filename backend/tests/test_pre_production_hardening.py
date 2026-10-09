import pytest
import hmac
import hashlib
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings, Settings
from app.integrations.razorpay.client import RazorpayProvider
from tests.test_utils import TestingSessionLocal

client = TestClient(app)


def test_production_secret_key_validation():
    """Verify that Settings raises a validation error if SECRET_KEY is default or too short in production."""
    with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR: SECRET_KEY"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="supersecretkey_please_change_in_production",
        )

    with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR: SECRET_KEY"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="short_key",
        )

    # Valid production settings should succeed
    valid_settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="a" * 32,
        RAZORPAY_KEY_ID="rzp_live_real_id",
        RAZORPAY_KEY_SECRET="rzp_live_real_secret",
        RAZORPAY_WEBHOOK_SECRET="rzp_live_webhook_secret",
        CLOUDINARY_CLOUD_NAME="prod_cloud",
        CLOUDINARY_API_KEY="prod_api_key",
        CLOUDINARY_API_SECRET="prod_api_secret",
        SHIPROCKET_EMAIL="ops@venopai.com",
        SHIPROCKET_PASSWORD="strong_password",
        SHIPROCKET_WEBHOOK_TOKEN="prod_shiprocket_token",
        CORS_ORIGINS=["https://venopai.com", "https://admin.venopai.com"],
        REDIS_URL="rediss://default:token@upstash.io:6379",
    )
    assert valid_settings.ENVIRONMENT == "production"
    assert len(valid_settings.SECRET_KEY) >= 32


def test_razorpay_mock_signature_rejected_in_production(monkeypatch):
    """Verify that verify_payment strictly rejects mock_valid_signature when ENVIRONMENT == 'production'."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "prod_secret_1234567890_abcdefghij")

    provider = RazorpayProvider(
        key_id="rzp_live_12345",
        key_secret="prod_secret_1234567890_abcdefghij",
    )

    # Mock signature must be rejected
    assert provider.verify_payment("pay_123", "order_123", "mock_valid_signature") is False
    assert provider.verify_payment("pay_123", "order_123", "test_signature") is False

    # Real HMAC signature must be accepted
    message = b"order_123|pay_123"
    valid_sig = hmac.new(b"prod_secret_1234567890_abcdefghij", message, hashlib.sha256).hexdigest()
    assert provider.verify_payment("pay_123", "order_123", valid_sig) is True


def test_razorpay_webhook_mock_signature_rejected_in_production(monkeypatch):
    """Verify that verify_webhook_signature strictly rejects mock_valid_signature when ENVIRONMENT == 'production'."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "wh_secret_1234567890_abcdefghij")

    provider = RazorpayProvider(
        webhook_secret="wh_secret_1234567890_abcdefghij",
    )

    payload = b'{"event": "payment.captured"}'

    # Mock signature must be rejected
    assert provider.verify_webhook_signature(payload, "mock_valid_signature") is False

    # Real HMAC signature must be accepted
    valid_sig = hmac.new(b"wh_secret_1234567890_abcdefghij", payload, hashlib.sha256).hexdigest()
    assert provider.verify_webhook_signature(payload, valid_sig) is True


def test_razorpay_mock_signature_allowed_in_dev(monkeypatch):
    """Verify that verify_payment allows mock signatures in development mode for seamless local testing."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    provider = RazorpayProvider(key_id="", key_secret="")

    assert provider.verify_payment("pay_123", "order_123", "mock_valid_signature") is True
    assert provider.verify_webhook_signature(b'{}', "mock_valid_signature") is True


def test_shiprocket_webhook_authentication(monkeypatch):
    """Verify that Shiprocket webhook enforces X-Shiprocket-Token when configured or in production."""
    monkeypatch.setattr(settings, "SHIPROCKET_WEBHOOK_TOKEN", "super_secure_shiprocket_token_999")

    # Missing token -> 401
    res_no_token = client.post(
        "/api/v1/webhooks/shiprocket",
        json={"awb": "AWB_TEST_1", "status": "in_transit"},
    )
    assert res_no_token.status_code == 401
    assert res_no_token.json()["error"]["code"] == "UNAUTHORIZED_WEBHOOK"

    # Wrong token -> 401
    res_wrong_token = client.post(
        "/api/v1/webhooks/shiprocket",
        headers={"X-Shiprocket-Token": "wrong_token"},
        json={"awb": "AWB_TEST_1", "status": "in_transit"},
    )
    assert res_wrong_token.status_code == 401

    # Correct token -> 200
    res_correct_token = client.post(
        "/api/v1/webhooks/shiprocket",
        headers={"X-Shiprocket-Token": "super_secure_shiprocket_token_999"},
        json={"awb": "AWB_TEST_TOKEN_SUCCESS", "status": "in_transit"},
    )
    assert res_correct_token.status_code == 200
