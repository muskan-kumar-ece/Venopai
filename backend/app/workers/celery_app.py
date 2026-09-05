from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "venopai",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=False,
    broker_transport_options={
        "max_retries": 1,
        "socket_timeout": 0.5,
        "socket_connect_timeout": 0.5,
    },
    beat_schedule={
        "release-expired-inventory-reservations-every-minute": {
            "task": "inventory.release_expired_reservations",
            "schedule": 60.0, # every 60 seconds (1 minute per Document 02 §12)
        },
        "reconcile-stale-pending-payments-every-10-minutes": {
            "task": "payment.reconcile_pending_payments",
            "schedule": 600.0, # every 10 minutes (Section 22)
        },
    },
)

