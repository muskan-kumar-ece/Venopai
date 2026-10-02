import os
import ssl
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "venopai",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

ssl_options = {
    "ssl_cert_reqs": ssl.CERT_REQUIRED,
    "ssl_check_hostname": True,
} if settings.REDIS_URL.startswith("rediss://") else None

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
        # 1. Expire inventory reservations every 1 minute (Doc 02 §12 & §19)
        "release-expired-inventory-reservations-every-minute": {
            "task": "inventory.release_expired_reservations",
            "schedule": float(os.environ.get("CELERY_BEAT_INVENTORY_INTERVAL", "60.0")),
        },
        # 2. Expire quotes every 15 minutes (Doc 01 QUOTE-002, Doc 02 §19)
        "expire-quotes-every-15-minutes": {
            "task": "quotes.expire_quotes",
            "schedule": 900.0,
        },
        # 3. Payment reconciliation every 15 minutes (Doc 02 §19, Section 22)
        "reconcile-stale-pending-payments-every-15-minutes": {
            "task": "payment.reconcile_pending_payments",
            "schedule": 900.0,
        },
        # 4. Shipment tracking sync every 30 minutes (Doc 02 §19)
        "sync-active-shipments-every-30-minutes": {
            "task": "shipping.sync_active_shipments",
            "schedule": 1800.0,
        },
        # 5. Notification retry sweep every 5 minutes (Doc 02 §19)
        "retry-failed-notifications-every-5-minutes": {
            "task": "notifications.retry_failed_notifications",
            "schedule": 300.0,
        },
        # 6. Consultation inactivity check daily (Doc 02 §19)
        "check-consultation-inactivity-daily": {
            "task": "consultation.check_inactivity_auto_close",
            "schedule": 86400.0,
        },
    },
)

# Explicitly register all task modules so worker and beat discover them
from app.workers.tasks import auth, consultations, files, inventory, payment, notification, shipping, quotes  # noqa: F401
