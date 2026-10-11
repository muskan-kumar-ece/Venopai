from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class OrderItemResponse(BaseModel):
    id: Optional[str] = None
    product_id: str
    name: str
    product_name: Optional[str] = None
    sku: Optional[str] = None
    unit_price: str
    quantity: int
    line_total: str
    total_price: Optional[str] = None

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
    shipping_fee: Optional[str] = None
    tax: OrderTaxResponse
    tax_amount: Optional[str] = None
    total: str
    total_amount: Optional[str] = None
    shipping_address: Optional[OrderShippingAddressResponse] = None
    shipping_address_snapshot: Optional[OrderShippingAddressResponse] = None
    shipment: Optional[OrderShipmentResponse] = None
    shipment_status: Optional[str] = None
    can_cancel: bool = False
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
    total_amount: Optional[str] = None
    created_at: str
    item_count: int
    items: Optional[List[OrderItemResponse]] = None
    shipment_status: Optional[str] = None

class OrderListResponse(BaseModel):
    data: List[OrderSummaryData]
    pagination: dict
    request_id: str

class OrderCancelRequest(BaseModel):
    reason: Optional[str] = None

class OrderInvoiceData(BaseModel):
    invoice_number: str
    order_id: str
    order_number: str
    invoice_url: str
    subtotal: str
    tax_total: str
    shipping_total: str
    total: str
    currency: str
    tax_breakdown: dict
    items: List[Dict[str, Any]]
    issued_at: str
    expires_at: str

class OrderInvoiceResponse(BaseModel):
    data: OrderInvoiceData
    request_id: str
