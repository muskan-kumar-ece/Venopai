from typing import List, Optional
from pydantic import BaseModel, Field

class CheckoutSessionCreate(BaseModel):
    address_id: str = Field(..., description="UUID of the customer's saved address")

class CheckoutAddressChange(BaseModel):
    address_id: str = Field(..., description="UUID of the new saved address to apply")

class CheckoutItemResponse(BaseModel):
    product_id: str
    name: str
    quantity: int
    unit_price: str

class CheckoutAddressResponse(BaseModel):
    id: str
    recipient_name: str
    phone: str
    line1: str
    line2: Optional[str] = None
    city: str
    state: str
    pincode: str
    country: str = "India"

class ShippingQuoteResponse(BaseModel):
    rate: str
    eta_days_min: int
    eta_days_max: int
    eta_description: str

class TaxBreakdownResponse(BaseModel):
    type: str # "CGST+SGST" or "IGST"
    amount: str
    cgst_amount: Optional[str] = None
    sgst_amount: Optional[str] = None
    igst_amount: Optional[str] = None

class CheckoutSessionData(BaseModel):
    checkout_session_id: str
    status: str = "open"
    items: Optional[List[CheckoutItemResponse]] = None
    address: Optional[CheckoutAddressResponse] = None
    reservation_expires_at: Optional[str] = None
    shipping: Optional[ShippingQuoteResponse] = None
    tax: Optional[TaxBreakdownResponse] = None
    subtotal: Optional[str] = None
    total: Optional[str] = None

class CheckoutSessionResponse(BaseModel):
    data: CheckoutSessionData
    request_id: str
