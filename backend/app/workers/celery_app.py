import ssl
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "venopai",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

ssl_options = {"ssl_cert_reqs": ssl.CERT_NONE} if settings.REDIS_URL.startswith("rediss://") else None

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    broker_use_ssl=ssl_options,
    redis_backend_use_ssl=ssl_options,
    broker_transport_options={
        "max_retries": 3,
        "socket_timeout": 5.0,
        "socket_connect_timeout": 5.0,
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
        "check-consultation-inactivity-daily": {
            "task": "consultation.check_inactivity_auto_close",
            "schedule": 86400.0, # daily (Document 02 §19)
        },
    },
)

# Explicitly register all task modules so worker and beat discover them
from app.workers.tasks import auth, consultations, files, inventory, payment  # noqa: F401

