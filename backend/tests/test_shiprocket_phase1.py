"""Unit and integration tests for Shiprocket Phase 1:
- Secure Authentication
- Token Caching, Expiry & Concurrency Locking
- Shared Authenticated HTTP Client
- Error Handling, Rate Limiting & Transient Retries
- Zero Credential Leakage / Secret Redaction
- Live vs Simulation Mode Strict Separation
"""
import json
import threading
import time
from unittest.mock import MagicMock
import pytest
import httpx

from app.core.config import settings
from app.integrations.shiprocket.auth import (
    ShiprocketAuthManager,
    REDIS_TOKEN_KEY,
    REDIS_LOCK_KEY,
    _mem_auth_lock,
)
import app.integrations.shiprocket.auth as auth_module
from app.integrations.shiprocket.exceptions import (
    ShiprocketError,
    ShiprocketConfigError,
    ShiprocketAuthError,
    ShiprocketRateLimitError,
    ShiprocketConnectionError,
    ShiprocketResponseError,
    sanitize_message,
)
from app.integrations.shiprocket.http_client import ShiprocketHttpClient
from app.integrations.shiprocket.client import ShiprocketProvider


# Helper: Mock transport to simulate httpx responses cleanly
class MockHttpTransport(httpx.BaseTransport):
    def __init__(self, handler):
        self.handler = handler

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        return self.handler(request)


# -------------------------------------------------------------------------
# 1. Authentication Tests
# -------------------------------------------------------------------------

def test_successful_authentication():
    """Verify that valid credentials obtain and parse token correctly."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/external/auth/login"
        body = json.loads(request.content.decode("utf-8"))
        assert body["email"] == "valid@example.com"
        assert body["password"] == "SecretPass123"
        return httpx.Response(
            200,
            json={"token": "mock_jwt_token_xyz_987", "id": 101, "company_id": 505},
            request=request,
        )

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(
        email="valid@example.com",
        password="SecretPass123",
        http_client=mock_client,
    )
    auth.invalidate_token()

    token = auth.get_token()
    assert token == "mock_jwt_token_xyz_987"


def test_invalid_credentials_raises_auth_error():
    """Verify that HTTP 401 raises ShiprocketAuthError without leaking credentials."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "Invalid login details"}, request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(
        email="bad@example.com",
        password="WrongPassword999",
        http_client=mock_client,
    )
    auth.invalidate_token()

    with pytest.raises(ShiprocketAuthError) as exc_info:
        auth.get_token()

    msg = str(exc_info.value)
    assert "Invalid email or password" in msg
    assert "WrongPassword999" not in msg
    assert "bad@example.com" not in msg


def test_missing_credentials_raises_config_error():
    """Verify that missing email or password raises ShiprocketConfigError safely."""
    auth = ShiprocketAuthManager(email="", password="")
    with pytest.raises(ShiprocketConfigError) as exc_info:
        auth.get_token()
    assert "credentials not configured" in str(exc_info.value)


# -------------------------------------------------------------------------
# 2. Token Caching, Expiry & Concurrency Tests
# -------------------------------------------------------------------------

def test_token_reuse_from_cache():
    """Verify that consecutive calls reuse cached token without duplicate HTTP calls."""
    call_count = 0

    def mock_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json={"token": "cached_token_123"}, request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(
        email="user@example.com",
        password="pwd",
        http_client=mock_client,
    )
    auth.invalidate_token()

    t1 = auth.get_token()
    t2 = auth.get_token()
    t3 = auth.get_token()

    assert t1 == t2 == t3 == "cached_token_123"
    assert call_count == 1  # Only one HTTP request made


def test_token_proactive_refresh_on_expiry():
    """Verify that an expired token triggers re-authentication."""
    call_count = 0

    def mock_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json={"token": f"token_v{call_count}"}, request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(
        email="user@example.com",
        password="pwd",
        http_client=mock_client,
        buffer_seconds=3600,
    )
    auth.invalidate_token()

    t1 = auth.get_token()
    assert t1 == "token_v1"
    assert call_count == 1

    # Simulate token expiration by manipulating both Redis and in-memory cache timestamp to the past
    redis = auth._get_redis()
    if redis:
        expired_payload = json.dumps({"token": "token_v1", "expires_at": time.time() - 100})
        redis.set(REDIS_TOKEN_KEY, expired_payload, ex=60)
    with _mem_auth_lock:
        auth_module._mem_token_cache = ("token_v1", time.time() - 100)

    t2 = auth.get_token()
    assert t2 == "token_v2"
    assert call_count == 2


def test_concurrent_refresh_locking():
    """Verify that concurrent threads refreshing cold cache execute only 1 HTTP request."""
    call_count = 0
    call_lock = threading.Lock()

    def mock_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        with call_lock:
            call_count += 1
        time.sleep(0.05)  # Simulate network latency
        return httpx.Response(200, json={"token": "concurrent_safe_token"}, request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(
        email="user@example.com",
        password="pwd",
        http_client=mock_client,
    )
    auth.invalidate_token()

    results = []

    def worker():
        tok = auth.get_token()
        results.append(tok)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(results) == 8
    assert all(r == "concurrent_safe_token" for r in results)
    assert call_count == 1  # Concurrency lock prevented stampede


def test_redis_failure_fallback_to_memory():
    """Verify that if Redis throws an exception, auth succeeds and caches in memory."""
    failing_redis = MagicMock()
    failing_redis.get.side_effect = RuntimeError("Redis connection broken")
    failing_redis.set.side_effect = RuntimeError("Redis write failed")

    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"token": "fallback_token_ok"}, request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(
        email="user@example.com",
        password="pwd",
        http_client=mock_client,
        redis_client=failing_redis,
    )
    auth.invalidate_token()

    token = auth.get_token()
    assert token == "fallback_token_ok"

    # Second call should use in-memory cache without error
    token2 = auth.get_token()
    assert token2 == "fallback_token_ok"


# -------------------------------------------------------------------------
# 3. Authenticated HTTP Client Tests
# -------------------------------------------------------------------------

def test_http_401_triggers_single_token_refresh_and_retry():
    """Verify that 401 Unauthorized invalidates token, refreshes, and retries once."""
    auth_calls = 0
    api_calls = 0

    def mock_handler(request: httpx.Request) -> httpx.Response:
        nonlocal auth_calls, api_calls
        if "/auth/login" in request.url.path:
            auth_calls += 1
            return httpx.Response(200, json={"token": f"jwt_refreshed_{auth_calls}"}, request=request)
        elif "/courier/serviceability" in request.url.path:
            api_calls += 1
            if api_calls == 1:
                # First attempt fails with 401 (e.g. stale/revoked token)
                return httpx.Response(401, json={"message": "Token expired"}, request=request)
            else:
                # Second attempt with refreshed token succeeds
                assert request.headers["Authorization"] == "Bearer jwt_refreshed_2"
                return httpx.Response(200, json={"status": 200, "data": {"available_courier_companies": [1]}}, request=request)
        return httpx.Response(404, request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(
        email="u@example.com",
        password="p",
        http_client=mock_client,
    )
    auth.invalidate_token()

    http_client = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)
    res = http_client.get("/courier/serviceability")

    assert res["status"] == 200
    assert api_calls == 2
    assert auth_calls == 2


def test_http_401_double_failure_prevents_infinite_loop():
    """Verify that if 401 persists after refresh, it stops after 1 retry and raises ShiprocketAuthError."""
    api_calls = 0

    def mock_handler(request: httpx.Request) -> httpx.Response:
        nonlocal api_calls
        if "/auth/login" in request.url.path:
            return httpx.Response(200, json={"token": "any_token"}, request=request)
        api_calls += 1
        return httpx.Response(401, json={"message": "Persistent 401"}, request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(
        email="u@example.com",
        password="p",
        http_client=mock_client,
    )
    auth.invalidate_token()

    http_client = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)

    with pytest.raises(ShiprocketAuthError) as exc_info:
        http_client.get("/test/endpoint")

    assert "rejected with 401 Unauthorized after token refresh" in str(exc_info.value)
    assert api_calls == 2  # Exactly 1 retry, no infinite loop


def test_http_429_rate_limiting_with_retry_after():
    """Verify that HTTP 429 parses Retry-After header and raises ShiprocketRateLimitError."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        if "/auth/login" in request.url.path:
            return httpx.Response(200, json={"token": "valid_token"}, request=request)
        return httpx.Response(429, headers={"Retry-After": "45"}, json={"message": "Too many requests"}, request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(email="u@example.com", password="p", http_client=mock_client)
    auth.invalidate_token()

    http_client = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)

    with pytest.raises(ShiprocketRateLimitError) as exc_info:
        http_client.get("/courier/serviceability")

    err = exc_info.value
    assert err.retry_after_seconds == 45
    assert "rate limit exceeded" in str(err)


def test_http_5xx_transient_retry():
    """Verify that a 503 transient server error is retried for idempotent GET requests."""
    attempts = 0

    def mock_handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        if "/auth/login" in request.url.path:
            return httpx.Response(200, json={"token": "valid_token"}, request=request)
        attempts += 1
        if attempts == 1:
            return httpx.Response(503, text="Service Unavailable", request=request)
        return httpx.Response(200, json={"data": "recovered"}, request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(email="u@example.com", password="p", http_client=mock_client)
    auth.invalidate_token()

    http_client = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)
    res = http_client.get("/test/transient")

    assert res["data"] == "recovered"
    assert attempts == 2


def test_connection_timeout_handling():
    """Verify that connection/read timeouts raise ShiprocketConnectionError."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        if "/auth/login" in request.url.path:
            return httpx.Response(200, json={"token": "valid_token"}, request=request)
        raise httpx.ReadTimeout("Read timed out after 15 seconds")

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(email="u@example.com", password="p", http_client=mock_client)
    auth.invalidate_token()

    http_client = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)

    with pytest.raises(ShiprocketConnectionError) as exc_info:
        http_client.get("/test/timeout", allow_transient_retry=False)

    assert "timed out" in str(exc_info.value)


def test_malformed_json_response_handling():
    """Verify that non-JSON responses from Shiprocket raise ShiprocketResponseError."""
    def mock_handler(request: httpx.Request) -> httpx.Response:
        if "/auth/login" in request.url.path:
            return httpx.Response(200, json={"token": "valid_token"}, request=request)
        return httpx.Response(200, text="<html><body>Bad Gateway Cloudflare</body></html>", request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(email="u@example.com", password="p", http_client=mock_client)
    auth.invalidate_token()

    http_client = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)

    with pytest.raises(ShiprocketResponseError) as exc_info:
        http_client.get("/test/badjson")

    assert "not valid JSON" in str(exc_info.value)


# -------------------------------------------------------------------------
# 4. Secret Redaction Tests
# -------------------------------------------------------------------------

def test_secret_redaction_in_messages_and_exceptions():
    """Verify that passwords, Bearer tokens, and token fields are stripped from all messages."""
    raw = 'Error calling https://api.shiprocket.in with Bearer eyJhbGciOiJIUzI1NiJ9.secret and {"password": "MySuperSecretPassword", "token": "abc123secret"}'
    sanitized = sanitize_message(raw)

    assert "MySuperSecretPassword" not in sanitized
    assert "abc123secret" not in sanitized
    assert "eyJhbGciOiJIUzI1NiJ9" not in sanitized
    assert "Bearer [REDACTED]" in sanitized
    assert '"password": "[REDACTED]"' in sanitized
    assert '"token": "[REDACTED]"' in sanitized

    # Exception repr and str
    err = ShiprocketError(raw)
    assert "MySuperSecretPassword" not in str(err)
    assert "MySuperSecretPassword" not in repr(err)


# -------------------------------------------------------------------------
# 5. Live Mode vs Simulation Mode Strict Separation Tests
# -------------------------------------------------------------------------

def test_live_mode_never_fabricates_mock_data(monkeypatch):
    """Verify that in live mode, an API failure raises ShiprocketError and NEVER returns mock data."""
    monkeypatch.setattr(settings, "SHIPROCKET_MODE", "live")
    monkeypatch.setattr(settings, "SHIPROCKET_EMAIL", "real_ops@venopai.in")
    monkeypatch.setattr(settings, "SHIPROCKET_PASSWORD", "real_password")

    def mock_handler(request: httpx.Request) -> httpx.Response:
        if "/auth/login" in request.url.path:
            return httpx.Response(200, json={"token": "live_test_token"}, request=request)
        # Serviceability endpoint fails with 500
        return httpx.Response(500, text="Internal Server Error at Shiprocket", request=request)

    mock_client = httpx.Client(transport=MockHttpTransport(mock_handler))
    auth = ShiprocketAuthManager(
        email="real_ops@venopai.in",
        password="real_password",
        http_client=mock_client,
    )
    auth.invalidate_token()
    http_cli = ShiprocketHttpClient(auth_manager=auth, http_client=mock_client)

    provider = ShiprocketProvider(auth_manager=auth, http_client=http_cli)
    assert provider.is_live is True

    # In live mode, failure MUST raise ShiprocketError, NOT silently return True or mock rate
    with pytest.raises(ShiprocketError):
        provider.check_serviceability("500001")

    with pytest.raises(ShiprocketError):
        provider.calculate_rate_and_eta("500001", "560001", 500)

    with pytest.raises(ShiprocketError):
        provider.get_tracking_status("AWB123456")


def test_simulation_mode_remains_deterministic(monkeypatch):
    """Verify that in simulation mode, deterministic results are returned without HTTP calls."""
    monkeypatch.setattr(settings, "SHIPROCKET_MODE", "simulation")

    provider = ShiprocketProvider()
    assert provider.is_live is False

    # Known mock unserviceable
    assert provider.check_serviceability("999999") is False
    assert provider.check_serviceability("000000") is False

    # Valid pincode
    assert provider.check_serviceability("500001") is True

    # Deterministic rate
    quote = provider.calculate_rate_and_eta("500001", "500002", 500)
    assert quote["serviceable"] is True
    assert quote["rate_paise"] == 6000
    assert quote["eta_days_min"] == 2
    assert quote["eta_days_max"] == 4

    # Deterministic tracking
    tracking = provider.get_tracking_status("AWB998877")
    assert tracking["tracking_number"] == "AWB998877"
    assert tracking["carrier"] == "Delhivery"
    assert tracking["status"] == "in_transit"
