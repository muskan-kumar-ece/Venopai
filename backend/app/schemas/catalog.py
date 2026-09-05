import json
from typing import Optional, List, Any
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, field_validator, Field
import uuid
from datetime import datetime

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def paise_to_rupees(paise: Optional[int]) -> Optional[str]:
    """Convert integer paise to decimal rupees string (e.g. 149900 -> '1499.00')."""
    if paise is None:
        return None
    return f"{paise / 100:.2f}"

def rupees_to_paise(rupees_str: str) -> int:
    """Parse rupee string like '1499.00' -> 149900 paise."""
    return round(Decimal(str(rupees_str)) * 100)

# ---------------------------------------------------------------------------
# Category schemas
# ---------------------------------------------------------------------------

class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    image_url: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    is_active: bool = True
    position: int = 0

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    slug: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    image_url: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None
    position: Optional[int] = None

class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    is_active: bool
    position: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    children: List['CategoryResponse'] = []

    model_config = ConfigDict(from_attributes=True)

CategoryResponse.model_rebuild()

# ---------------------------------------------------------------------------
# Product schemas
# ---------------------------------------------------------------------------

class ProductBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    slug: str = Field(..., min_length=1, max_length=500)
    sku: Optional[str] = None
    description: Optional[str] = None
    category_ids: List[uuid.UUID] = Field(default_factory=list, description="One or more category UUIDs (CAT-010)")
    is_featured: bool = False
    weight_grams: Optional[int] = None
    specifications: Optional[List[dict]] = None
    variant_attributes: Optional[List[dict]] = None
    images: Optional[List[str]] = None

class ProductCreate(ProductBase):
    price: str = Field(..., description="Price in INR, e.g. '1499.00'")
    compare_price: Optional[str] = Field(None, description="Compare/strikethrough price in INR")
    cost_price: Optional[str] = Field(None, description="Cost price in INR (internal only)")
    status: str = Field(default="draft")

    @field_validator("price", "compare_price", "cost_price", mode="before")
    @classmethod
    def validate_price_string(cls, v):
        if v is None:
            return v
        try:
            d = Decimal(str(v))
            if d < 0:
                raise ValueError("Price cannot be negative")
            return str(v)
        except Exception:
            raise ValueError(f"Invalid price format: {v}")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        valid = {"draft", "active", "inactive", "discontinued"}
        if v not in valid:
            raise ValueError(f"status must be one of {valid}")
        return v

class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=500)
    slug: Optional[str] = None
    sku: Optional[str] = None
    description: Optional[str] = None
    category_ids: Optional[List[uuid.UUID]] = None
    price: Optional[str] = None
    compare_price: Optional[str] = None
    cost_price: Optional[str] = None
    status: Optional[str] = None
    is_featured: Optional[bool] = None
    weight_grams: Optional[int] = None
    specifications: Optional[List[dict]] = None
    variant_attributes: Optional[List[dict]] = None
    images: Optional[List[str]] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is None:
            return v
        valid = {"draft", "active", "inactive", "discontinued"}
        if v not in valid:
            raise ValueError(f"status must be one of {valid}")
        return v

class InventoryResponse(BaseModel):
    product_id: uuid.UUID
    stock_quantity: int
    reserved_quantity: int
    available_quantity: int

    model_config = ConfigDict(from_attributes=True)

class ProductPublicResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str] = None
    price: str
    compare_price: Optional[str] = None
    currency: str = "INR"
    stock_status: str
    primary_image_url: Optional[str] = None
    images: List[str] = []
    specifications: List[dict] = []
    variant_attributes: Optional[List[dict]] = None
    category_ids: List[uuid.UUID] = []
    is_featured: bool
    weight_grams: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ProductAdminResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    sku: Optional[str] = None
    description: Optional[str] = None
    price: str
    compare_price: Optional[str] = None
    cost_price: Optional[str] = None
    currency: str = "INR"
    status: str
    stock_status: str
    is_featured: bool
    primary_image_url: Optional[str] = None
    images: List[str] = []
    specifications: List[dict] = []
    variant_attributes: Optional[List[dict]] = None
    category_ids: List[uuid.UUID] = []
    weight_grams: Optional[int] = None
    inventory: Optional[InventoryResponse] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ProductImageUploadResponse(BaseModel):
    product_id: uuid.UUID
    image_url: str
    images: List[str]
    primary_image_url: Optional[str]

    model_config = ConfigDict(from_attributes=True)

# ---------------------------------------------------------------------------
# Inventory Adjustment schemas
# ---------------------------------------------------------------------------

class InventoryAdjustRequest(BaseModel):
    delta: int
    reason: str = Field(..., min_length=1, max_length=500, description="Required reason for audit")

class InventoryAdjustResponse(BaseModel):
    product_id: uuid.UUID
    stock_quantity: int
    reserved_quantity: int
    available_quantity: int
    adjusted_by: int
    reason: str
