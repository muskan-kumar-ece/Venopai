"""
Shared test configuration for all test modules.

This conftest.py sets app.dependency_overrides[get_db] ONCE using the
shared engine from test_utils.py, so all test files use the same DB.
"""
from app.main import app
from app.api.deps import get_db
from tests.test_utils import TestingSessionLocal


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Set override once here — all test modules benefit from this
app.dependency_overrides[get_db] = override_get_db

from app.workers.celery_app import celery_app
celery_app.conf.task_always_eager = True
celery_app.conf.task_eager_propagates = True
celery_app.conf.broker_url = "memory://"
celery_app.conf.result_backend = "cache+memory://"
