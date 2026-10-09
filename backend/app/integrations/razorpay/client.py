import hmac
import hashlib
import uuid
import logging
from typing import Optional
import httpx

from app.core.config import settings
from app.integrations.payment import PaymentGateway, GatewayIntent, GatewayRefund

logger = logging.getLogger("venopai.integrations.razorpay")

class RazorpayProvider(PaymentGateway):
    """PAY-001: Sole V1 Payment Gateway integration for Razorpay.
    Provides order creation, signature verification, webhook verification, and refund dispatch.
    """

    def __init__(
        self,
        key_id: Optional[str] = None,
        key_secret: Optional[str] = None,
        webhook_secret: Optional[str] = None,
    ):
        self._key_id = key_id
        self._key_secret = key_secret
        self._webhook_secret = webhook_secret

    @property
    def key_id(self) -> str:
        return self._key_id or settings.RAZORPAY_KEY_ID

    @key_id.setter
    def key_id(self, val: Optional[str]) -> None:
        self._key_id = val

    @property
    def key_secret(self) -> str:
        return self._key_secret or settings.RAZORPAY_KEY_SECRET

    @key_secret.setter
    def key_secret(self, val: Optional[str]) -> None:
        self._key_secret = val

    @property
    def webhook_secret(self) -> str:
        return self._webhook_secret or settings.RAZORPAY_WEBHOOK_SECRET

    @webhook_secret.setter
    def webhook_secret(self, val: Optional[str]) -> None:
        self._webhook_secret = val

    @property
    def is_live_configured(self) -> bool:
        return bool(self.key_id and self.key_secret)

    def create_payment_intent(
        self,
        amount: int,
        currency: str = "INR",
        reference: str = "",
    ) -> GatewayIntent:
        """Calls Razorpay /v1/orders to register an order for checkout."""
        key_id = self.key_id or settings.RAZORPAY_KEY_ID
        key_secret = self.key_secret or settings.RAZORPAY_KEY_SECRET

        if self.is_live_configured:
            try:
                url = "https://api.razorpay.com/v1/orders"
                payload = {
                    "amount": amount,
                    "currency": currency,
                    "receipt": reference[:40],
                }
                with httpx.Client(timeout=10.0) as client:
                    resp = client.post(
                        url,
                        json=payload,
                        auth=(key_id, key_secret),
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    return GatewayIntent(
                        id=data["id"],
                        amount=data["amount"],
                        currency=data.get("currency", currency),
                        receipt=reference,
                        status=data.get("status", "created"),
                        key_id=key_id,
                    )
            except Exception as e:
                logger.error(f"Razorpay live order creation failed: {e}.")
                if settings.ENVIRONMENT == "production":
                    raise RuntimeError(f"Razorpay live order creation failed in production: {e}") from e
                logger.warning("Falling back to mock intent in non-production environment.")
        elif settings.ENVIRONMENT == "production":
            raise RuntimeError("CRITICAL: Live Razorpay credentials not configured in production. Mock orders are disabled.")

        # Development / Test mock fallback
        mock_id = f"order_mock_{uuid.uuid4().hex[:14]}"
        return GatewayIntent(
            id=mock_id,
            amount=amount,
            currency=currency,
            receipt=reference,
            status="created",
            key_id=key_id or "rzp_test_mock_key",
        )

    def verify_payment(
        self,
        payment_id: str,
        order_id: str,
        signature: str,
    ) -> bool:
        """PAY-002: Server-side cryptographic verification of Razorpay payment callback."""
        if not signature:
            return False

        secret = self.key_secret or settings.RAZORPAY_KEY_SECRET

        # Strict check in production: mock signatures are strictly forbidden
        if settings.ENVIRONMENT == "production":
            if not secret:
                logger.error("Razorpay key secret is not configured in production.")
                return False
            if signature in ("mock_valid_signature", "mock_signature", "test_signature"):
                logger.warning("Attempted to use mock Razorpay signature in production environment.")
                return False
        else:
            # Allow mock signatures only in non-production environments (dev/test/staging)
            if not secret and signature in ("mock_valid_signature", "mock_signature", "test_signature"):
                return True
            if signature == "mock_valid_signature":
                return True

        message = f"{order_id}|{payment_id}".encode("utf-8")
        expected_sig = hmac.new(
            secret.encode("utf-8"),
            message,
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(expected_sig, signature)

    def verify_webhook_signature(
        self,
        payload: bytes,
        signature_header: str,
    ) -> bool:
        """Section 9: Verify X-Razorpay-Signature using raw request body before parsing."""
        if not signature_header:
            return False

        secret = self.webhook_secret or settings.RAZORPAY_WEBHOOK_SECRET

        # Strict check in production: mock signatures are strictly forbidden
        if settings.ENVIRONMENT == "production":
            if not secret:
                logger.error("Razorpay webhook secret is not configured in production.")
                return False
            if signature_header in ("mock_valid_signature", "mock_webhook_signature", "test_signature"):
                logger.warning("Attempted to use mock Razorpay webhook signature in production environment.")
                return False
        else:
            # Fallback for dev/testing when no webhook secret is set
            if not secret and signature_header in ("mock_valid_signature", "mock_webhook_signature", "test_signature"):
                return True
            if signature_header == "mock_valid_signature":
                return True

        expected_sig = hmac.new(
            secret.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(expected_sig, signature_header)

    def initiate_refund(
        self,
        gateway_payment_id: str,
        amount: int,
    ) -> GatewayRefund:
        """Calls Razorpay /v1/payments/{payment_id}/refund to dispatch full or partial refund."""
        if self.is_live_configured:
            try:
                url = f"https://api.razorpay.com/v1/payments/{gateway_payment_id}/refund"
                payload = {"amount": amount}
                with httpx.Client(timeout=10.0) as client:
                    resp = client.post(
                        url,
                        json=payload,
                        auth=(self.key_id, self.key_secret),
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    return GatewayRefund(
                        id=data["id"],
                        payment_id=gateway_payment_id,
                        amount=data.get("amount", amount),
                        status=data.get("status", "processed"),
                    )
            except Exception as e:
                logger.error(f"Razorpay live refund failed: {e}.")
                if settings.ENVIRONMENT == "production":
                    raise RuntimeError(f"Razorpay live refund failed in production: {e}") from e
                logger.warning("Falling back to mock refund in non-production environment.")
        elif settings.ENVIRONMENT == "production":
            raise RuntimeError("CRITICAL: Live Razorpay credentials not configured in production. Mock refunds are disabled.")

        # Development / Test mock fallback
        mock_refund_id = f"rfnd_mock_{uuid.uuid4().hex[:14]}"
        return GatewayRefund(
            id=mock_refund_id,
            payment_id=gateway_payment_id,
            amount=amount,
            status="processed",
        )
