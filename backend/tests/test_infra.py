import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "venopai-backend"}

def test_config_loads():
    assert settings.PROJECT_NAME == "VenopAI"
    assert "postgresql" in settings.DATABASE_URL
    assert "redis" in settings.REDIS_URL

def test_db_session_constructs():
    from app.db.session import SessionLocal, engine
    from sqlalchemy.engine import make_url
    expected = make_url(settings.DATABASE_URL)
    assert engine.url.host == expected.host
    assert engine.url.database == expected.database
    assert engine.url.username == expected.username
    # Do not execute queries to avoid needing a real DB
    assert SessionLocal is not None
