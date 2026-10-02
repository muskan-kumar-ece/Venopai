# Celery tasks package
from app.workers.tasks import auth, consultations, files, inventory, payment, notification, shipping, quotes

__all__ = [
    "auth",
    "consultations",
    "files",
    "inventory",
    "payment",
    "notification",
    "shipping",
    "quotes",
]
