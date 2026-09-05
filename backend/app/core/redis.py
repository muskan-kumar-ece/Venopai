from app.core.config import settings

# This file establishes the Redis boundary
# For now, it just loads the URL configuration
# In future phases, this will contain Redis connection pooling/logic

def get_redis_url() -> str:
    return settings.REDIS_URL
