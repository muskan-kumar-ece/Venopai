"""Resend email provider integration conforming to Document 02 §17.

Transactional email delivery via Resend API with HTTP client abstraction,
mock fallback for local/test environments, and zero credential leakage.
"""
import os
import uuid
import logging
from typing import Dict, Any, Optional, Protocol
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailProvider(Protocol):
    def send(
        self,
        to: str,
        subject: str,
        html_body: Optional[str] = None,
        text_body: Optional[str] = None,
        template_id: Optional[str] = None,
        body: Optional[str] = None,
    ) -> Dict[str, Any]:
        ...


class ResendProvider:
    """Production Resend HTTP client implementation."""

    API_URL = "https://api.resend.com/emails"

    @property
    def api_key(self) -> str:
        return settings.RESEND_API_KEY or ""

    @property
    def sender(self) -> str:
        return settings.EMAIL_FROM or "notifications@venopai.com"

    def is_mock(self) -> bool:
        """Determines whether to execute live API call or return deterministic mock."""
        if not self.api_key:
            return True
        if self.api_key.startswith("re_mock") or self.api_key == "test_key":
            return True
        if "PYTEST_CURRENT_TEST" in os.environ:
            return True
        return False

    def send(
        self,
        to: str,
        subject: str,
        html_body: Optional[str] = None,
        text_body: Optional[str] = None,
        template_id: Optional[str] = None,
        body: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Send a transactional email using Resend API.
        
        Never prints or logs the raw API key.
        """
        if not html_body and text_body:
            html_body = f"<p>{text_body}</p>"
        elif not html_body and body:
            html_body = f"<p>{body}</p>"
        elif not html_body:
            html_body = "<p></p>"
        if self.is_mock():
            mock_id = f"msg_mock_{uuid.uuid4().hex[:12]}"
            logger.info(f"[RESEND MOCK] Dispatched email to {to} | Subject: {subject} | Mock ID: {mock_id}")
            return {
                "id": mock_id,
                "to": to,
                "subject": subject,
                "mock": True,
                "status": "sent",
            }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: Dict[str, Any] = {
            "from": f"VenopAI <{self.sender}>",
            "to": [to],
            "subject": subject,
            "html": html_body,
        }
        if text_body:
            payload["text"] = text_body

        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.post(self.API_URL, headers=headers, json=payload)
                if response.status_code in (200, 201):
                    res_data = response.json()
                    logger.info(f"[RESEND SUCCESS] Email sent to {to} | ID: {res_data.get('id')}")
                    return {
                        "id": res_data.get("id", str(uuid.uuid4())),
                        "to": to,
                        "subject": subject,
                        "status": "sent",
                        "mock": False,
                    }
                else:
                    error_msg = f"Resend API error {response.status_code}: {response.text}"
                    logger.error(f"[RESEND ERROR] Failed to send email to {to}: {response.status_code}")
                    raise RuntimeError(error_msg)
        except httpx.HTTPError as exc:
            logger.error(f"[RESEND EXCEPTION] Network failure sending email to {to}: {str(exc)}")
            raise RuntimeError(f"Resend network error: {str(exc)}") from exc


resend_provider = ResendProvider()
