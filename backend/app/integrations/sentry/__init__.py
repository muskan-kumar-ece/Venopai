import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

def init_sentry() -> bool:
    """Initialize Sentry SDK with FastAPI integration if SENTRY_DSN is configured."""
    if not settings.SENTRY_DSN:
        return False

    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.SENTRY_ENVIRONMENT,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            send_default_pii=False,
        )
        return True
    except Exception as e:
        logger.error(f"Failed to initialize Sentry SDK: {e}")
        return False


