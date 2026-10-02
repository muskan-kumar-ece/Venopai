import uuid
import sentry_sdk
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError, HTTPException
from app.core.config import settings
from app.core.exceptions import (
    APIException,
    http_exception_handler,
    api_exception_handler,
    validation_exception_handler,
    global_exception_handler,
)
from app.api.v1 import api_router
from app.integrations.sentry import init_sentry

# Initialize Sentry before the FastAPI app is created
init_sentry()

app = FastAPI(
    title=settings.PROJECT_NAME,
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "production" else None,
)

# Correlation / Request ID middleware
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
    if settings.SENTRY_DSN:
        sentry_sdk.set_tag("request_id", request_id)
    response: Response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

# Set up CORS
cors_origins = [str(origin).rstrip("/") for origin in settings.CORS_ORIGINS] if settings.CORS_ORIGINS else []
if settings.ENVIRONMENT != "production":
    for dev_origin in ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]:
        if dev_origin not in cors_origins:
            cors_origins.append(dev_origin)

cors_kwargs = {
    "allow_origins": cors_origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.ENVIRONMENT != "production":
    cors_kwargs["allow_origin_regex"] = r"^https?://(localhost|127\.0\.0\.1|.*\.trycloudflare\.com)(:[0-9]+)?$"

app.add_middleware(
    CORSMiddleware,
    **cors_kwargs,
)

# Exception handlers
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(APIException, api_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, global_exception_handler)

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/health")
def root_health():
    return {"status": "ok", "service": "venopai-backend"}
