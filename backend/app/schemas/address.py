import re
from typing import Optional
from pydantic import BaseModel, Field, field_validator

class AddressCreate(BaseModel):
    recipient_name: str = Field(..., min_length=2, max_length=100, description="Name of the recipient")
    phone: str = Field(..., description="Indian mobile phone number e.g. +919812345678")
    line1: str = Field(..., min_length=3, max_length=255, description="Street address line 1")
    line2: Optional[str] = Field(None, max_length=255, description="Street address line 2 / Landmark")
    city: str = Field(..., min_length=2, max_length=100, description="City")
    state: str = Field(..., min_length=2, max_length=100, description="State / Union Territory")
    pincode: str = Field(..., description="6-digit Indian PIN code")
    is_default: bool = Field(False, description="Set as default address")

    @field_validator("phone")
    def validate_phone(cls, v: str) -> str:
        clean = re.sub(r"[\s\-]", "", v)
        if clean.startswith("+91"):
            clean = clean[3:]
        elif clean.startswith("91") and len(clean) == 12:
            clean = clean[2:]
        elif clean.startswith("0") and len(clean) == 11:
            clean = clean[1:]
        if not (len(clean) == 10 and clean.isdigit() and clean[0] in "6789"):
            raise ValueError("Invalid Indian mobile number. Must be 10 digits starting with 6-9")
        return f"+91{clean}"

    @field_validator("pincode")
    def validate_pincode(cls, v: str) -> str:
        clean = v.strip()
        if not (len(clean) == 6 and clean.isdigit() and clean[0] != "0"):
            raise ValueError("Invalid Indian PIN code. Must be exactly 6 digits without leading zero")
        return clean


class AddressUpdate(BaseModel):
    recipient_name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = None
    line1: Optional[str] = Field(None, min_length=3, max_length=255)
    line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, min_length=2, max_length=100)
    state: Optional[str] = Field(None, min_length=2, max_length=100)
    pincode: Optional[str] = None
    is_default: Optional[bool] = None

    @field_validator("phone")
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        clean = re.sub(r"[\s\-]", "", v)
        if clean.startswith("+91"):
            clean = clean[3:]
        elif clean.startswith("91") and len(clean) == 12:
            clean = clean[2:]
        elif clean.startswith("0") and len(clean) == 11:
            clean = clean[1:]
        if not (len(clean) == 10 and clean.isdigit() and clean[0] in "6789"):
            raise ValueError("Invalid Indian mobile number. Must be 10 digits starting with 6-9")
        return f"+91{clean}"

    @field_validator("pincode")
    def validate_pincode(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        clean = v.strip()
        if not (len(clean) == 6 and clean.isdigit() and clean[0] != "0"):
            raise ValueError("Invalid Indian PIN code. Must be exactly 6 digits without leading zero")
        return clean


class AddressResponse(BaseModel):
    id: str
    recipient_name: str
    phone: str
    line1: str
    line2: Optional[str] = None
    city: str
    state: str
    pincode: str
    country: str = "India"
    is_default: bool
    serviceability_warning: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
