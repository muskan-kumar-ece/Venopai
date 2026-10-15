"""Shiprocket integration exceptions with automatic credential and token redaction.

Ensures that errors, logs, and exception strings never leak passwords,
bearer tokens, or sensitive credentials.
"""
import re
from typing import Any, Optional


def sanitize_message(text: str) -> str:
    """Sanitize strings by redacting bearer tokens, passwords, and sensitive keys."""
    if not text:
        return ""
    # Redact Bearer tokens
    sanitized = re.sub(r"Bearer\s+[A-Za-z0-9\-_\.]+", "Bearer [REDACTED]", text, flags=re.IGNORECASE)
    # Redact password fields in JSON or key-value format
    sanitized = re.sub(r'("password"\s*:\s*)"[^"]*"', r'\1"[REDACTED]"', sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r'(password\s*=\s*)[^\s,;&]+', r'\1[REDACTED]', sanitized, flags=re.IGNORECASE)
    # Redact token fields in JSON
    sanitized = re.sub(r'("token"\s*:\s*)"[^"]*"', r'\1"[REDACTED]"', sanitized, flags=re.IGNORECASE)
    return sanitized


class ShiprocketError(Exception):
    """Base exception for all Shiprocket integration errors."""

    def __init__(self, message: str, details: Optional[Any] = None):
        self.raw_message = message
        self.message = sanitize_message(message)
        self.details = details
        super().__init__(self.message)

    def __str__(self) -> str:
        return self.message

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}({self.message!r})"


class ShiprocketConfigError(ShiprocketError):
    """Raised when Shiprocket configuration or credentials are missing or invalid."""
    pass


class ShiprocketAuthError(ShiprocketError):
    """Raised when authentication against Shiprocket API fails (HTTP 401 or bad credentials)."""
    pass


class ShiprocketRateLimitError(ShiprocketError):
    """Raised when Shiprocket rate limits are encountered (HTTP 429)."""

    def __init__(self, message: str, retry_after_seconds: Optional[int] = None, details: Optional[Any] = None):
        self.retry_after_seconds = retry_after_seconds
        super().__init__(message, details=details)


class ShiprocketConnectionError(ShiprocketError):
    """Raised when network, connection, or timeout errors occur when reaching Shiprocket."""
    pass


class ShiprocketResponseError(ShiprocketError):
    """Raised when Shiprocket returns an unexpected HTTP status code or malformed payload."""

    def __init__(self, message: str, status_code: Optional[int] = None, response_data: Optional[Any] = None):
        self.status_code = status_code
        self.response_data = response_data
        super().__init__(message, details=response_data)
