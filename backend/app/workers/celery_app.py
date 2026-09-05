# Celery app placeholder
# The Celery configuration boundary for background tasks

from app.core.config import settings

# This is a placeholder for Celery setup. 
# We do not define business logic or actual Celery app yet.
# In Phase 2, this will be:
# from celery import Celery
# celery_app = Celery("venopai", broker=settings.REDIS_URL, backend=settings.REDIS_URL)

CELERY_BROKER_URL = settings.REDIS_URL
