from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, model_validator

class QuoteLineItem(BaseModel):
    description: Optional[str] = None
    name: Optional[str] = None
    amount: str = Field(...)  # decimal string in rupees, e.g. "8500.00"

    @model_validator(mode="before")
    @classmethod
    def populate_description(cls, values):
        if isinstance(values, dict):
            desc = values.get("description") or values.get("name")
            if not desc:
                raise ValueError("description or name is required for line item")
            values["description"] = desc
        return values

class AdminQuoteCreateRequest(BaseModel):
    request_type: str = Field(default="manufacturing")
    request_id: str = Field(...)
    line_items: List[QuoteLineItem] = Field(..., min_length=1)
    shipping_amount: Optional[str] = "0.00"
    estimated_timeline: Optional[str] = None
    valid_until: Optional[str] = None
    terms: Optional[str] = None
    scope_summary: Optional[str] = None

class AdminQuoteDraftUpdateRequest(BaseModel):
    line_items: Optional[List[QuoteLineItem]] = None
    shipping_amount: Optional[str] = None
    estimated_timeline: Optional[str] = None
    valid_until: Optional[str] = None
    terms: Optional[str] = None
    scope_summary: Optional[str] = None

class AdminQuoteReviseRequest(BaseModel):
    line_items: List[QuoteLineItem] = Field(..., min_length=1)
    shipping_amount: Optional[str] = "0.00"
    estimated_timeline: Optional[str] = None
    valid_until: Optional[str] = None
    terms: Optional[str] = None
    scope_summary: Optional[str] = None

class CustomerQuoteRejectRequest(BaseModel):
    reason: Optional[str] = None

class CustomerQuoteApproveRequest(BaseModel):
    version_number: Optional[int] = None

class QuoteTaxDetail(BaseModel):
    type: str  # "IGST" or "CGST+SGST"
    amount: str
    amount_paise: int

class QuoteVersionData(BaseModel):
    id: str
    version_number: int
    status: str
    scope_summary: Optional[str] = None
    line_items: List[QuoteLineItem] = Field(default_factory=list)
    subtotal: str
    subtotal_paise: int
    tax: QuoteTaxDetail
    shipping_amount: str
    shipping_amount_paise: int
    total: str
    total_paise: int
    estimated_timeline: Optional[str] = None
    valid_until: Optional[str] = None
    terms: Optional[str] = None
    created_at: str
    approval: Optional[Dict[str, Any]] = None

class QuoteDetailData(BaseModel):
    id: str
    request_type: str
    request_id: str
    project_id: Optional[str] = None
    status: str
    current_version: QuoteVersionData
    created_at: str
    updated_at: str

class QuoteDetailResponse(BaseModel):
    data: QuoteDetailData
    request_id: str

class QuoteSummaryData(BaseModel):
    id: str
    request_type: str
    request_id: str
    project_id: Optional[str] = None
    status: str
    version_number: int
    total: str
    total_paise: int
    valid_until: Optional[str] = None
    created_at: str

class QuoteListResponse(BaseModel):
    data: List[QuoteSummaryData]
    request_id: str

class QuoteVersionListResponse(BaseModel):
    data: List[QuoteVersionData]
    request_id: str

class QuoteApprovalData(BaseModel):
    id: str
    version_number: int
    status: str
    user_id: str
    reason: Optional[str] = None
    created_at: str

class QuoteApprovalListResponse(BaseModel):
    data: List[QuoteApprovalData]
    request_id: str
