import logging
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

@celery_app.task(name="auth.send_verification_email")
def send_verification_email_task(email: str, token: str, full_name: str):
    logger.info(f"[EMAIL TASK] Sending verification email to {email} for {full_name}")
    # In full implementation, calls ResendProvider integration
    return True

@celery_app.task(name="auth.send_password_reset_email")
def send_password_reset_email_task(email: str, token: str):
    logger.info(f"[EMAIL TASK] Sending password reset email to {email}")
    # In full implementation, calls ResendProvider integration
    return True
