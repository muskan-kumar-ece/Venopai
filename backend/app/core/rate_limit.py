import logging
from typing import Optional
from fastapi import Request
import redis
from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_client: Optional[redis.Redis] = None

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
            logger.warning(f"Redis not reachable for rate limiting ({e}). Operating in fail-open mode.")
            _redis_client = None
    return _redis_client

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

def check_rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    """
    Checks rate limit in Redis.
    Fails open (returns True) if Redis is unavailable so that local dev / tests without Redis work reliably.
    Returns True if allowed, False if rate limited.
    """
    import os
    if os.environ.get("PYTEST_CURRENT_TEST") or os.environ.get("TESTING") == "1":
        return True
    client = get_redis_client()
    if not client:
        return True
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
        logger.warning(f"Redis rate limit check error: {e}")
        return True
