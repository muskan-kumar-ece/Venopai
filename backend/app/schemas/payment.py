from typing import Optional, List
from pydantic import BaseModel, Field

class PaymentInitiateRequest(BaseModel):
    source_type: str = Field(..., description="'checkout_session' or 'quote'")
    source_id: str = Field(..., description="UUID of checkout session or quote")

class PaymentInitiateData(BaseModel):
    payment_id: str
    razorpay_order_id: str
    gateway_order_id: Optional[str] = None
    provider: str = "razorpay"
    amount: str
    amount_paise: Optional[int] = None
    currency: str = "INR"
    key_id: str

class PaymentInitiateResponse(BaseModel):
    data: PaymentInitiateData
    request_id: str

class PaymentConfirmRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str

class PaymentConfirmData(BaseModel):
    payment_id: str
    status: str
    order_id: Optional[str] = None
    order_number: Optional[str] = None

class PaymentConfirmResponse(BaseModel):
    data: PaymentConfirmData
    request_id: str

class PaymentDetailData(BaseModel):
    id: str
    payment_id: Optional[str] = None
    status: str
    amount: str
    currency: str = "INR"
    linked_order_id: Optional[str] = None
    linked_quote_id: Optional[str] = None
    created_at: str
    confirmed_at: Optional[str] = None

class PaymentDetailResponse(BaseModel):
    data: PaymentDetailData
    request_id: str

class PaymentListResponse(BaseModel):
    data: List[PaymentDetailData]
    pagination: dict
    request_id: str

class AdminRefundRequest(BaseModel):
    amount: Optional[str] = Field(None, description="Optional refund amount in INR; full if omitted")
    amount_paise: Optional[int] = Field(None, description="Optional refund amount in paise")
    reason: Optional[str] = Field(None, description="Reason for refund")

class AdminRefundData(BaseModel):
    refund_id: str
    status: str = "initiated"

class AdminRefundResponse(BaseModel):
    data: AdminRefundData
    request_id: str
