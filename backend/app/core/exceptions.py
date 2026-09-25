import uuid
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError, HTTPException
from fastapi.encoders import jsonable_encoder
from app.core.logging import logger

def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", str(uuid.uuid4()))

class APIException(Exception):
    def __init__(self, message: str, code: str = "API_ERROR", status_code: int = 400, details: dict = None):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details

async def http_exception_handler(request: Request, exc: HTTPException):
    request_id = get_request_id(request)
    # Check if detail is a dictionary with code and message
    if isinstance(exc.detail, dict):
        code = exc.detail.get("code", "ERROR")
        message = exc.detail.get("message", "An error occurred")
    else:
        code = "HTTP_ERROR" if exc.status_code != 401 else "UNAUTHORIZED"
        if exc.status_code == 403:
            code = "FORBIDDEN"
        elif exc.status_code == 404:
            code = "NOT_FOUND"
        elif exc.status_code == 409:
            code = "CONFLICT"
        elif exc.status_code == 429:
            code = "RATE_LIMIT_EXCEEDED"
        message = str(exc.detail)

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "request_id": request_id,
            }
        },
    )

async def api_exception_handler(request: Request, exc: APIException):
    request_id = get_request_id(request)
    logger.error(f"API Error [{exc.code}]: {exc.message}")
    err_content = {
        "code": exc.code,
        "message": exc.message,
        "request_id": request_id,
    }
    if exc.details:
        err_content["details"] = exc.details
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": err_content},
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = get_request_id(request)
    logger.warning(f"Validation Error: {exc.errors()}")
    # Extract friendly message
    errors = exc.errors()
    first_error = errors[0] if errors else {}
    loc = ".".join([str(x) for x in first_error.get("loc", []) if str(x) != "body"])
    msg = first_error.get("msg", "Validation error")
    formatted_msg = f"{loc}: {msg}" if loc else msg

    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": formatted_msg,
                "details": jsonable_encoder(errors),
                "request_id": request_id,
            }
        },
    )

async def global_exception_handler(request: Request, exc: Exception):
    request_id = get_request_id(request)
    logger.exception(f"Unhandled Exception: {exc}")
    try:
        from app.core.config import settings
        if settings.SENTRY_DSN:
            import sentry_sdk
            sentry_sdk.set_tag("request_id", request_id)
            sentry_sdk.capture_exception(exc)
    except Exception:
        pass
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Internal Server Error",
                "request_id": request_id,
            }
        },
    )
