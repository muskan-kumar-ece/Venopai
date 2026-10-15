"""Shared authenticated HTTP client for Shiprocket API.

Handles:
- Centralized base URL configuration
- Automatic Bearer token injection via ShiprocketAuthManager
- Connection pooling and explicit timeouts
- Single 401 token-refresh retry loop prevention
- 429 rate limit parsing with Retry-After support
- Bounded retries for transient 5xx server errors on idempotent requests
- Structured logging with full secret/PII redaction
- Dependency injection for clean testability
"""
import logging
import time
import uuid
from typing import Any, Dict, Optional, Union

import httpx

from app.core.config import settings
from app.integrations.shiprocket.auth import ShiprocketAuthManager
from app.integrations.shiprocket.exceptions import (
    ShiprocketAuthError,
    ShiprocketConnectionError,
    ShiprocketRateLimitError,
    ShiprocketResponseError,
    sanitize_message,
)

logger = logging.getLogger("venopai.integrations.shiprocket.http")


class ShiprocketHttpClient:
    """Production-grade HTTP client for Shiprocket external REST APIs."""

    def __init__(
        self,
        auth_manager: Optional[ShiprocketAuthManager] = None,
        base_url: Optional[str] = None,
        http_client: Optional[httpx.Client] = None,
        transport: Optional[httpx.BaseTransport] = None,
        timeout_seconds: Optional[float] = None,
        connect_timeout_seconds: Optional[float] = None,
    ):
        self.auth_manager = auth_manager or ShiprocketAuthManager()
        self._base_url = base_url
        if http_client is not None:
            self._custom_client = http_client
        elif transport is not None:
            self._custom_client = httpx.Client(transport=transport)
        else:
            self._custom_client = None
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else settings.SHIPROCKET_REQUEST_TIMEOUT_SECONDS
        )
        self.connect_timeout_seconds = (
            connect_timeout_seconds
            if connect_timeout_seconds is not None
            else settings.SHIPROCKET_CONNECT_TIMEOUT_SECONDS
        )

    @property
    def base_url(self) -> str:
        url = self._base_url if self._base_url is not None else settings.SHIPROCKET_API_BASE_URL
        return url.rstrip("/")

    def _get_client(self) -> httpx.Client:
        if self._custom_client is not None:
            return self._custom_client
        return httpx.Client(
            timeout=httpx.Timeout(self.timeout_seconds, connect=self.connect_timeout_seconds),
            headers={"Accept": "application/json"},
        )

    def request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None,
        allow_transient_retry: bool = True,
        _is_401_retry: bool = False,
    ) -> Dict[str, Any]:
        """Execute an authenticated request to Shiprocket API.
        
        Args:
            method: HTTP verb (GET, POST, PUT, DELETE)
            endpoint: Relative path (e.g. '/courier/serviceability')
            params: Optional query parameters
            json_data: Optional JSON body
            correlation_id: Optional correlation tracking UUID
            allow_transient_retry: Whether to retry transient 5xx/connection failures (True for GET/read)
            _is_401_retry: Internal guard to prevent infinite 401 refresh loops
        """
        norm_endpoint = endpoint if endpoint.startswith("/") else f"/{endpoint}"
        url = f"{self.base_url}{norm_endpoint}"
        cid = correlation_id or str(uuid.uuid4())

        # Obtain authentication token
        token = self.auth_manager.get_token(force_refresh=_is_401_retry)

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Correlation-ID": cid,
        }

        client = self._get_client()
        should_close_client = (self._custom_client is None)

        start_time = time.time()
        attempt = 0
        max_transient_attempts = 2 if allow_transient_retry and method.upper() in ("GET", "HEAD") else 1

        while attempt < max_transient_attempts:
            attempt += 1
            try:
                logger.debug(f"[Shiprocket HTTP] {method.upper()} {norm_endpoint} (cid={cid}, attempt={attempt})")
                resp = client.request(
                    method=method.upper(),
                    url=url,
                    params=params,
                    json=json_data,
                    headers=headers,
                )
                elapsed_ms = round((time.time() - start_time) * 1000, 2)
                logger.info(
                    f"[Shiprocket HTTP] {method.upper()} {norm_endpoint} -> {resp.status_code} "
                    f"in {elapsed_ms}ms (cid={cid})"
                )

                # 1. Handle 401 Unauthorized: token expired or invalid
                if resp.status_code == 401:
                    if not _is_401_retry:
                        logger.warning(
                            f"[Shiprocket HTTP] 401 Unauthorized on {norm_endpoint}. "
                            "Invalidating token and attempting single refresh retry."
                        )
                        self.auth_manager.invalidate_token()
                        if should_close_client:
                            client.close()
                        return self.request(
                            method=method,
                            endpoint=endpoint,
                            params=params,
                            json_data=json_data,
                            correlation_id=cid,
                            allow_transient_retry=allow_transient_retry,
                            _is_401_retry=True,
                        )
                    else:
                        logger.error(f"[Shiprocket HTTP] Persistent 401 Unauthorized after token refresh on {norm_endpoint}")
                        raise ShiprocketAuthError("Shiprocket API request rejected with 401 Unauthorized after token refresh")

                # 2. Handle 429 Too Many Requests
                if resp.status_code == 429:
                    retry_after = None
                    ra_hdr = resp.headers.get("Retry-After")
                    if ra_hdr and ra_hdr.isdigit():
                        retry_after = int(ra_hdr)
                    logger.warning(f"[Shiprocket HTTP] Rate limit exceeded (429) on {norm_endpoint}. Retry-After: {retry_after}")
                    raise ShiprocketRateLimitError(
                        "Shiprocket rate limit exceeded (HTTP 429)",
                        retry_after_seconds=retry_after,
                    )

                # 3. Handle 5xx Transient Server Errors
                if 500 <= resp.status_code < 600:
                    if attempt < max_transient_attempts:
                        logger.warning(
                            f"[Shiprocket HTTP] Server error {resp.status_code} on {norm_endpoint}. "
                            f"Retrying in 0.5s (attempt {attempt}/{max_transient_attempts})..."
                        )
                        time.sleep(0.5)
                        continue
                    else:
                        raw_body = sanitize_message(resp.text[:500])
                        raise ShiprocketResponseError(
                            f"Shiprocket server error HTTP {resp.status_code}: {raw_body}",
                            status_code=resp.status_code,
                        )

                # 4. Handle 4xx Client Errors (other than 401, 429)
                if 400 <= resp.status_code < 500:
                    try:
                        err_json = resp.json()
                        err_msg = err_json.get("message") or err_json.get("error") or str(err_json)
                    except Exception:
                        err_msg = resp.text[:300]
                    sanitized_err = sanitize_message(str(err_msg))
                    raise ShiprocketResponseError(
                        f"Shiprocket API error HTTP {resp.status_code}: {sanitized_err}",
                        status_code=resp.status_code,
                        response_data=sanitized_err,
                    )

                # 5. Success (2xx): Parse JSON
                try:
                    data = resp.json()
                    return data
                except Exception as je:
                    logger.error(f"[Shiprocket HTTP] Failed to parse JSON response from {norm_endpoint}")
                    raise ShiprocketResponseError(
                        f"Shiprocket response was not valid JSON: {sanitize_message(resp.text[:200])}",
                        status_code=resp.status_code,
                    ) from je

            except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.TimeoutException) as te:
                if attempt < max_transient_attempts:
                    logger.warning(f"[Shiprocket HTTP] Timeout on {norm_endpoint}. Retrying... (attempt {attempt})")
                    time.sleep(0.5)
                    continue
                logger.error(f"[Shiprocket HTTP] Request timed out on {norm_endpoint}")
                raise ShiprocketConnectionError(f"Shiprocket request timed out: {type(te).__name__}") from te
            except httpx.ConnectError as ce:
                if attempt < max_transient_attempts:
                    logger.warning(f"[Shiprocket HTTP] Connection error on {norm_endpoint}. Retrying... (attempt {attempt})")
                    time.sleep(0.5)
                    continue
                logger.error(f"[Shiprocket HTTP] Connection failure on {norm_endpoint}")
                raise ShiprocketConnectionError(f"Connection failure to Shiprocket: {ce}") from ce
            except httpx.HTTPError as he:
                logger.error(f"[Shiprocket HTTP] HTTP error on {norm_endpoint}: {he}")
                raise ShiprocketConnectionError(f"HTTP network error to Shiprocket: {he}") from he
            finally:
                if should_close_client and attempt >= max_transient_attempts:
                    try:
                        client.close()
                    except Exception:
                        pass

        # Fallback if loop ends without return/raise
        raise ShiprocketResponseError("Shiprocket request terminated unexpectedly without response")

    def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None, **kwargs) -> Dict[str, Any]:
        return self.request("GET", endpoint, params=params, **kwargs)

    def post(self, endpoint: str, json_data: Optional[Dict[str, Any]] = None, **kwargs) -> Dict[str, Any]:
        return self.request("POST", endpoint, json_data=json_data, **kwargs)

    def put(self, endpoint: str, json_data: Optional[Dict[str, Any]] = None, **kwargs) -> Dict[str, Any]:
        return self.request("PUT", endpoint, json_data=json_data, **kwargs)

    def delete(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return self.request("DELETE", endpoint, **kwargs)
