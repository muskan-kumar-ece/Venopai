from pydantic import BaseModel, EmailStr, Field
from typing import Optional

class UserUpdateProfile(BaseModel):
    name: Optional[str] = Field(None, description="Full name")
    phone: Optional[str] = Field(None, description="Phone number")

class UserEmailChange(BaseModel):
    new_email: EmailStr

class UserPasswordChange(BaseModel):
    current_password: str
    new_password: str
