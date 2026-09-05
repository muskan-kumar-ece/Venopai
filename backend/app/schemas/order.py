from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class OrderItemResponse(BaseModel):
    product_id: str
    name: str
    unit_price: str
    quantity: int
    line_total: str

class OrderShippingAddressResponse(BaseModel):
    recipient_name: str
    phone: str
    line1: str
    line2: Optional[str] = None
    city: str
    state: str
    pincode: str
    country: str = "India"

class OrderTaxResponse(BaseModel):
    type: str
    amount: str
    cgst_amount: Optional[str] = None
    sgst_amount: Optional[str] = None
    igst_amount: Optional[str] = None

class OrderShipmentResponse(BaseModel):
    id: str
    status: str
    tracking_number: Optional[str] = None
    carrier: Optional[str] = None

class OrderDetailData(BaseModel):
    id: str
    order_number: str
    status: str
    payment_status: str
    items: List[OrderItemResponse]
    subtotal: str
    shipping_amount: str
    tax: OrderTaxResponse
    total: str
    shipping_address: Optional[OrderShippingAddressResponse] = None
    shipment: Optional[OrderShipmentResponse] = None
    estimated_delivery: Optional[str] = None
    created_at: str
    paid_at: Optional[str] = None

class OrderDetailResponse(BaseModel):
    data: OrderDetailData
    request_id: str

class OrderSummaryData(BaseModel):
    id: str
    order_number: str
    status: str
    payment_status: str
    total: str
    created_at: str
    item_count: int

class OrderListResponse(BaseModel):
    data: List[OrderSummaryData]
    pagination: dict
    request_id: str

class OrderCancelRequest(BaseModel):
    reason: Optional[str] = None
