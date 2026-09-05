import re
import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict

def validate_password_strength(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if not re.search(r"[A-Za-z]", v):
        raise ValueError("Password must contain at least one letter")
    if not re.search(r"\d", v):
        raise ValueError("Password must contain at least one number")
    return v

def validate_indian_phone(v: Optional[str]) -> Optional[str]:
    if v is None or v == "":
        return None
    cleaned = re.sub(r"[\s\-]", "", v)
    if not re.match(r"^(\+91)?[6-9]\d{9}$", cleaned):
        raise ValueError("Phone number must be a valid Indian mobile number (+91 followed by 10 digits, or 10 digits starting with 6-9)")
    return v

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str = Field(..., min_length=2, max_length=100)
    phone: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_password_strength(v)

    @field_validator("phone")
    @classmethod
    def validate_phone_number(cls, v: Optional[str]) -> Optional[str]:
        return validate_indian_phone(v)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class AdminLogin(BaseModel):
    email: EmailStr
    password: str

class VerifyEmail(BaseModel):
    token: str

class ResendVerification(BaseModel):
    email: EmailStr

class ForgotPassword(BaseModel):
    email: EmailStr

class ResetPassword(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return validate_password_strength(v)

class UserResponseData(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    status: str
    phone: Optional[str] = None
    is_admin: Optional[bool] = False
    role: Optional[str] = None
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class StandardResponse(BaseModel):
    data: Dict[str, Any]
    request_id: str

class StandardErrorResponse(BaseModel):
    error: Dict[str, Any]
