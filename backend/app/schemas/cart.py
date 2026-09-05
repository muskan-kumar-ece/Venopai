from typing import List, Optional
from pydantic import BaseModel, Field

class CartItemAdd(BaseModel):
    product_id: str = Field(..., description="UUID of the product to add")
    quantity: int = Field(..., ge=1, description="Quantity to add (must be at least 1)")

class CartItemUpdate(BaseModel):
    quantity: int = Field(..., ge=1, description="Updated quantity (must be at least 1)")

class CartItemResponse(BaseModel):
    id: str
    product_id: str
    name: str
    unit_price: str
    quantity: int
    line_total: str
    stock_warning: bool = False
    image_url: Optional[str] = None

class CartData(BaseModel):
    id: str
    items: List[CartItemResponse]
    subtotal: str
    currency: str = "INR"

class CartResponse(BaseModel):
    data: CartData
    request_id: str
