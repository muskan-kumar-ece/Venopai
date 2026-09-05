from typing import Protocol, Optional
from dataclasses import dataclass

@dataclass(frozen=True)
class GatewayIntent:
    id: str
    amount: int
    currency: str
    receipt: str
    status: str
    key_id: Optional[str] = None

@dataclass(frozen=True)
class GatewayRefund:
    id: str
    payment_id: str
    amount: int
    status: str

class PaymentGateway(Protocol):
    def create_payment_intent(
        self,
        amount: int,
        currency: str,
        reference: str,
    ) -> GatewayIntent:
        """Creates a payment order/intent at the payment gateway."""
        ...

    def verify_payment(
        self,
        payment_id: str,
        order_id: str,
        signature: str,
    ) -> bool:
        """Verifies the client checkout completion signature server-side."""
        ...

    def verify_webhook_signature(
        self,
        payload: bytes,
        signature_header: str,
    ) -> bool:
        """Verifies HMAC signature on incoming raw webhook payloads."""
        ...

    def initiate_refund(
        self,
        gateway_payment_id: str,
        amount: int,
    ) -> GatewayRefund:
        """Initiates full or partial refund with the gateway."""
        ...
