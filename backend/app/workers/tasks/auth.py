"""Celery tasks for authentication-related emails.
Conforms to Document 01 §7.1 & §17, Document 02 §17 & §20.
"""
import logging
from app.workers.celery_app import celery_app
from app.integrations.resend import resend_provider

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="auth.send_verification_email", max_retries=3, default_retry_delay=60)
def send_verification_email_task(self, email: str, token: str, full_name: str):
    """Dispatches account email verification link via Resend. Tokens are never logged."""
    logger.info(f"[EMAIL TASK] Sending verification email to {email}")
    try:
        verify_url = f"http://localhost:3000/verify-email?token={token}&email={email}"
        html_body = f"""
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Verify your VenopAI account</h2>
            <p>Hello {full_name},</p>
            <p>Thank you for registering with VenopAI. Please verify your email address by clicking the link below:</p>
            <p><a href="{verify_url}" style="display: inline-block; padding: 10px 20px; background-color: #0284c7; color: #ffffff; text-decoration: none; border-radius: 4px;">Verify Email</a></p>
            <p>If you did not create an account, you can safely ignore this email.</p>
        </div>
        """
        resend_provider.send(
            to=email,
            subject="Verify your VenopAI Account",
            html_body=html_body,
            text_body=f"Verify your VenopAI account: {verify_url}",
        )
        return True
    except Exception as exc:
        logger.error(f"[EMAIL TASK] Failed sending verification email: {str(exc)[:200]}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, name="auth.send_password_reset_email", max_retries=3, default_retry_delay=60)
def send_password_reset_email_task(self, email: str, token: str):
    """Dispatches password reset link via Resend. Tokens are never logged."""
    logger.info(f"[EMAIL TASK] Sending password reset email to {email}")
    try:
        reset_url = f"http://localhost:3000/reset-password?token={token}"
        html_body = f"""
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Reset your VenopAI password</h2>
            <p>We received a request to reset your password. Click the link below to set a new password:</p>
            <p><a href="{reset_url}" style="display: inline-block; padding: 10px 20px; background-color: #0284c7; color: #ffffff; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
            <p>If you did not request a password reset, please contact support immediately.</p>
        </div>
        """
        resend_provider.send(
            to=email,
            subject="Reset your VenopAI Password",
            html_body=html_body,
            text_body=f"Reset your VenopAI password: {reset_url}",
        )
        return True
    except Exception as exc:
        logger.error(f"[EMAIL TASK] Failed sending password reset email: {str(exc)[:200]}")
        raise self.retry(exc=exc)
