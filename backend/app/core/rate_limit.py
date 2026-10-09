import logging
from typing import Optional
from fastapi import Request
import redis
from app.core.config import settings

import time
import threading
import os

logger = logging.getLogger(__name__)

_redis_client: Optional[redis.Redis] = None
_in_memory_limits: dict[str, list[float]] = {}
_mem_lock = threading.Lock()

def _check_in_memory_rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    """Thread-safe in-memory sliding window rate limiter fallback."""
    now = time.time()
    cutoff = now - window_seconds
    with _mem_lock:
        timestamps = _in_memory_limits.get(key, [])
        valid = [t for t in timestamps if t > cutoff]
        if len(valid) >= limit:
            _in_memory_limits[key] = valid
            return False
        valid.append(now)
        _in_memory_limits[key] = valid
        return True

def get_redis_client() -> Optional[redis.Redis]:
    global _redis_client
    if _redis_client is None:
        try:
            extra_kwargs = {}
            if settings.REDIS_URL.startswith("rediss://"):
                import ssl
                extra_kwargs["ssl_cert_reqs"] = ssl.CERT_REQUIRED
                extra_kwargs["ssl_check_hostname"] = True

            _redis_client = redis.from_url(
                settings.REDIS_URL,
                socket_timeout=1.5,
                socket_connect_timeout=1.5,
                decode_responses=True,
                **extra_kwargs,
            )
            # Ping test with short timeout
            _redis_client.ping()
        except Exception as e:
            logger.debug(f"Redis not reachable for rate limiting ({e}). Operating in memory-fallback mode.")
            _redis_client = None
    return _redis_client

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

def check_rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    """
    Checks rate limit via Redis with thread-safe in-memory sliding window fallback.
    Returns True if allowed, False if rate limited.
    """
    if os.environ.get("PYTEST_CURRENT_TEST") or os.environ.get("TESTING") == "1":
        if os.environ.get("TEST_RATE_LIMIT") == "1":
            return _check_in_memory_rate_limit(key, limit, window_seconds)
        return True

    client = get_redis_client()
    if not client:
        return _check_in_memory_rate_limit(key, limit, window_seconds)

    try:
        current = client.get(key)
        if current is not None and int(current) >= limit:
            return False
        pipe = client.pipeline()
        pipe.incr(key)
        if current is None:
            pipe.expire(key, window_seconds)
        pipe.execute()
        return True
    except Exception as e:
        logger.warning(f"Redis rate limit check error: {e}. Falling back to in-memory check.")
        return _check_in_memory_rate_limit(key, limit, window_seconds)


class RateLimiter:
    """
    Declarative FastAPI rate limiting dependency.
    Usage:
        @router.post("/items", dependencies=[Depends(RateLimiter(limit=10, window_seconds=60, key_prefix="rl:items"))])
    """
    def __init__(self, limit: int, window_seconds: int, key_prefix: str, scope: str = "user_or_ip"):
        self.limit = limit
        self.window_seconds = window_seconds
        self.key_prefix = key_prefix
        self.scope = scope  # "ip", "user", "user_or_ip"

    def __call__(self, request: Request) -> bool:
        from app.core.exceptions import APIException
        ip = get_client_ip(request)
        user_id = getattr(request.state, "user_id", None)

        if not user_id and self.scope in ("user", "user_or_ip"):
            auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
            if auth_header and auth_header.startswith("Bearer "):
                try:
                    import jwt
                    token = auth_header.split(" ", 1)[1]
                    payload = jwt.decode(
                        token,
                        settings.SECRET_KEY,
                        algorithms=[settings.ALGORITHM],
                        audience=["customer", "admin"],
                    )
                    user_id = payload.get("sub")
                except Exception:
                    pass

        if self.scope in ("user", "user_or_ip") and user_id:
            ident = f"user:{user_id}"
        else:
            ident = f"ip:{ip}"

        key = f"{self.key_prefix}:{ident}"
        allowed = check_rate_limit(key, self.limit, self.window_seconds)
        if not allowed:
            raise APIException(
                status_code=429,
                code="RATE_LIMIT_EXCEEDED",
                message=f"Rate limit of {self.limit} requests per {self.window_seconds}s exceeded. Please slow down.",
            )
        return True


