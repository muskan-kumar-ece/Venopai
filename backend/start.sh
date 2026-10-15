#!/usr/bin/env bash
set -e

PORT_TO_USE="${PORT:-10000}"

echo "==> [STARTUP] Running database migrations..."
alembic upgrade head || true

echo "==> [STARTUP] Starting Celery Worker and Beat in background..."
celery -A app.workers.celery_app.celery_app worker -B --loglevel=info --concurrency=1 &
CELERY_PID=$!
echo "==> [STARTUP] Celery running with PID ${CELERY_PID}"

cleanup() {
    echo "==> [SHUTDOWN] Terminating Celery process ${CELERY_PID}..."
    kill -TERM "$CELERY_PID" 2>/dev/null || true
    wait "$CELERY_PID" 2>/dev/null || true
    echo "==> [SHUTDOWN] Cleanup complete."
}
trap cleanup SIGTERM SIGINT EXIT

echo "==> [STARTUP] Starting Uvicorn on port ${PORT_TO_USE}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT_TO_USE}" --workers 1
