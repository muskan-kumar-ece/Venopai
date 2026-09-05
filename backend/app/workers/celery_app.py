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
)
