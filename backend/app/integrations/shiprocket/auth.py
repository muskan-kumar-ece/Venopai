"""Shiprocket Authentication and Token Management.

Implements token retrieval, caching in Redis with in-memory fallback,
proactive expiry management, distributed locking against stampedes,
and zero credential leakage.
"""
import json
import logging
import threading
import time
import uuid
from typing import Any, Dict, Optional, Tuple

import httpx

from app.core.config import settings
from app.core.rate_limit import get_redis_client
from app.integrations.shiprocket.exceptions import (
    ShiprocketAuthError,
    ShiprocketConfigError,
    ShiprocketConnectionError,
    ShiprocketResponseError,
)

logger = logging.getLogger("venopai.integrations.shiprocket.auth")

# Default token lifetime for Shiprocket: 10 days = 240 hours = 864,000 seconds
SHIPROCKET_TOKEN_LIFETIME_SECONDS = 864000
REDIS_TOKEN_KEY = "venopai:shiprocket:auth_token"
REDIS_LOCK_KEY = "venopai:shiprocket:auth_lock"

# Thread-safe in-memory fallback: (token, expires_at_timestamp)
_mem_token_cache: Optional[Tuple[str, float]] = None
_mem_auth_lock = threading.RLock()


class ShiprocketAuthManager:
    """Manages Shiprocket authentication token acquisition, caching, and refresh."""

    def __init__(
        self,
        email: Optional[str] = None,
        password: Optional[str] = None,
        base_url: Optional[str] = None,
        http_client: Optional[httpx.Client] = None,
        redis_client: Optional[Any] = None,
        buffer_seconds: Optional[int] = None,
    ):
        self._email = email
        self._password = password
        self._base_url = base_url
        self._custom_http_client = http_client
        self._custom_redis_client = redis_client
        self._buffer_seconds = buffer_seconds

    @property
    def email(self) -> str:
        return self._email if self._email is not None else settings.SHIPROCKET_EMAIL

    @property
    def password(self) -> str:
        return self._password if self._password is not None else settings.SHIPROCKET_PASSWORD

    @property
    def base_url(self) -> str:
        url = self._base_url if self._base_url is not None else settings.SHIPROCKET_API_BASE_URL
        return url.rstrip("/")

    @property
    def buffer_seconds(self) -> int:
        return (
            self._buffer_seconds
            if self._buffer_seconds is not None
            else settings.SHIPROCKET_TOKEN_CACHE_BUFFER_SECONDS
        )

    def _get_redis(self) -> Optional[Any]:
        if self._custom_redis_client is not None:
            return self._custom_redis_client
        return get_redis_client()

    def get_token(self, force_refresh: bool = False) -> str:
        """Retrieve a valid authentication token.
        
        Uses cached token if available and unexpired.
        Acquires a concurrency lock to prevent thundering-herd refresh attempts.
        """
        if not self.email or not self.password:
            raise ShiprocketConfigError(
                "Shiprocket credentials not configured. Please set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD."
            )

        if not force_refresh:
            cached_token = self._get_cached_token()
            if cached_token:
                return cached_token

        # Token missing or refresh forced: acquire lock and refresh
        return self._refresh_token_safely()

    def invalidate_token(self) -> None:
        """Invalidate the cached token in both Redis and in-memory cache."""
        global _mem_token_cache
        with _mem_auth_lock:
            _mem_token_cache = None

        redis = self._get_redis()
        if redis:
            try:
                redis.delete(REDIS_TOKEN_KEY)
                logger.debug("Shiprocket auth token invalidated in Redis.")
            except Exception as e:
                logger.warning(f"Failed to invalidate Shiprocket token in Redis: {e}")

    def _get_cached_token(self) -> Optional[str]:
        """Check Redis and in-memory cache for a valid, non-expired token."""
        now = time.time()
        redis = self._get_redis()

        # 1. Try Redis
        if redis:
            try:
                raw = redis.get(REDIS_TOKEN_KEY)
                if raw:
                    data = json.loads(raw)
                    expires_at = data.get("expires_at", 0)
                    token = data.get("token")
                    if token and (now < expires_at - self.buffer_seconds):
                        return token
            except Exception as e:
                logger.debug(f"Redis get token error: {e}. Checking in-memory cache.")

        # 2. Try In-Memory Fallback
        global _mem_token_cache
        with _mem_auth_lock:
            if _mem_token_cache:
                token, expires_at = _mem_token_cache
                if now < expires_at - self.buffer_seconds:
                    return token
                else:
                    _mem_token_cache = None

        return None

    def _refresh_token_safely(self) -> str:
        """Acquire lock (distributed or in-memory) to prevent stampedes, then refresh."""
        redis = self._get_redis()
        lock_id = str(uuid.uuid4())
        have_redis_lock = False

        if redis:
            try:
                # Try acquiring distributed lock with 15s expiration
                have_redis_lock = bool(redis.set(REDIS_LOCK_KEY, lock_id, nx=True, ex=15))
                if not have_redis_lock:
                    # Another worker is refreshing; poll for up to 5 seconds
                    logger.debug("Another worker is refreshing Shiprocket token; waiting...")
                    for _ in range(25):
                        time.sleep(0.2)
                        token = self._get_cached_token()
                        if token:
                            return token
                    # If still no token after 5s, acquire thread lock and proceed
            except Exception as e:
                logger.debug(f"Distributed lock attempt failed ({e}); falling back to in-memory lock.")

        with _mem_auth_lock:
            # Re-check cache after acquiring in-memory lock
            cached = self._get_cached_token()
            if cached:
                if have_redis_lock and redis:
                    self._release_redis_lock(redis, lock_id)
                return cached

            try:
                token = self._request_new_token()
                expires_at = time.time() + SHIPROCKET_TOKEN_LIFETIME_SECONDS

                # Save in-memory
                global _mem_token_cache
                _mem_token_cache = (token, expires_at)

                # Save in Redis if available
                if redis:
                    try:
                        ttl = max(60, int(SHIPROCKET_TOKEN_LIFETIME_SECONDS - self.buffer_seconds))
                        cache_data = json.dumps({"token": token, "expires_at": expires_at})
                        redis.set(REDIS_TOKEN_KEY, cache_data, ex=ttl)
                        logger.info("Successfully refreshed and cached Shiprocket token in Redis.")
                    except Exception as re:
                        logger.warning(f"Failed to cache Shiprocket token in Redis ({re}); cached in-memory.")

                return token
            finally:
                if have_redis_lock and redis:
                    self._release_redis_lock(redis, lock_id)

    def _release_redis_lock(self, redis: Any, lock_id: str) -> None:
        """Safely release the Redis lock if it still belongs to this worker."""
        try:
            lua_release = """
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
            """
            redis.eval(lua_release, 1, REDIS_LOCK_KEY, lock_id)
        except Exception:
            try:
                redis.delete(REDIS_LOCK_KEY)
            except Exception:
                pass

    def _request_new_token(self) -> str:
        """Execute HTTP request to Shiprocket /auth/login endpoint."""
        url = f"{self.base_url}/auth/login"
        payload = {"email": self.email, "password": self.password}
        headers = {"Content-Type": "application/json", "Accept": "application/json"}

        logger.info(f"Initiating Shiprocket authentication request for user: {self.email[:3]}***")

        try:
            if self._custom_http_client:
                resp = self._custom_http_client.post(url, json=payload, headers=headers)
            else:
                with httpx.Client(
                    timeout=httpx.Timeout(
                        settings.SHIPROCKET_REQUEST_TIMEOUT_SECONDS,
                        connect=settings.SHIPROCKET_CONNECT_TIMEOUT_SECONDS,
                    )
                ) as client:
                    resp = client.post(url, json=payload, headers=headers)
        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.TimeoutException) as te:
            logger.error("Shiprocket authentication timeout")
            raise ShiprocketConnectionError(f"Shiprocket authentication timed out: {type(te).__name__}") from te
        except httpx.ConnectError as ce:
            logger.error("Shiprocket connection failure")
            raise ShiprocketConnectionError(f"Failed to connect to Shiprocket API: {ce}") from ce
        except httpx.HTTPError as he:
            logger.error(f"Shiprocket HTTP failure: {he}")
            raise ShiprocketConnectionError(f"Network error during Shiprocket authentication: {he}") from he

        if resp.status_code == 401 or resp.status_code == 403:
            logger.warning("Shiprocket authentication rejected (401/403): Invalid credentials")
            raise ShiprocketAuthError("Shiprocket authentication failed: Invalid email or password")

        if resp.status_code != 200:
            logger.error(f"Shiprocket authentication returned non-200 status: {resp.status_code}")
            raise ShiprocketResponseError(
                f"Shiprocket authentication failed with HTTP {resp.status_code}",
                status_code=resp.status_code,
            )

        try:
            data = resp.json()
        except Exception as je:
            logger.error("Shiprocket authentication returned malformed JSON")
            raise ShiprocketResponseError("Shiprocket auth response was not valid JSON") from je

        token = data.get("token")
        if not token or not isinstance(token, str):
            logger.error("Shiprocket authentication response missing 'token' key")
            raise ShiprocketResponseError("Shiprocket auth response missing access token")

        return token
