import json
import logging
import threading
import time
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from app.core.rate_limit import get_redis_client

logger = logging.getLogger(__name__)

# Thread-safe in-memory cache fallback: {key: (expiry_timestamp, serialized_json)}
_mem_cache: dict[str, tuple[float, str]] = {}
_mem_lock = threading.Lock()


class CacheJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder for UUIDs, datetimes, decimals, and sets."""
    def default(self, obj: Any) -> Any:
        if isinstance(obj, UUID):
            return str(obj)
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return str(obj)
        if isinstance(obj, set):
            return list(obj)
        return super().default(obj)


def cache_get(key: str) -> Optional[Any]:
    """
    Retrieve deserialized value from Redis or thread-safe in-memory fallback.
    Returns None on cache miss or expiration.
    """
    client = get_redis_client()
    if client:
        try:
            val = client.get(key)
            if val is not None:
                return json.loads(val)
            return None
        except Exception as e:
            logger.debug(f"Redis get failed for {key}: {e}. Falling back to in-memory cache.")

    # In-memory fallback
    now = time.time()
    with _mem_lock:
        entry = _mem_cache.get(key)
        if not entry:
            return None
        expiry, raw_json = entry
        if expiry <= now:
            del _mem_cache[key]
            return None
        try:
            return json.loads(raw_json)
        except Exception:
            return None


def cache_set(key: str, value: Any, ttl_seconds: int = 300) -> bool:
    """
    Store serialized value in Redis or thread-safe in-memory fallback with TTL.
    """
    try:
        serialized = json.dumps(value, cls=CacheJSONEncoder)
    except Exception as e:
        logger.warning(f"Failed to serialize cache value for key {key}: {e}")
        return False

    client = get_redis_client()
    if client:
        try:
            client.set(key, serialized, ex=ttl_seconds)
            return True
        except Exception as e:
            logger.debug(f"Redis set failed for {key}: {e}. Falling back to in-memory cache.")

    # In-memory fallback
    now = time.time()
    expiry = now + ttl_seconds
    with _mem_lock:
        _mem_cache[key] = (expiry, serialized)
    return True


def cache_delete(key: str) -> bool:
    """
    Delete a specific key from Redis and in-memory cache.
    """
    client = get_redis_client()
    if client:
        try:
            client.delete(key)
        except Exception as e:
            logger.debug(f"Redis delete failed for {key}: {e}")

    with _mem_lock:
        _mem_cache.pop(key, None)
    return True


def cache_delete_pattern(pattern: str) -> int:
    """
    Delete all keys matching a wildcard pattern (e.g. 'cache:categories:*').
    Returns the count of deleted keys.
    """
    count = 0
    client = get_redis_client()
    if client:
        try:
            keys = client.keys(pattern)
            if keys:
                count += client.delete(*keys)
        except Exception as e:
            logger.debug(f"Redis delete_pattern failed for {pattern}: {e}")

    # In-memory matching
    # Convert Redis wildcard pattern to fnmatch
    import fnmatch
    with _mem_lock:
        matching_keys = [k for k in _mem_cache.keys() if fnmatch.fnmatch(k, pattern)]
        for k in matching_keys:
            del _mem_cache[k]
            count += 1

    return count
