from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, model_validator

class ManufacturingRequestCreate(BaseModel):
    title: str = Field(..., min_length=1)
    project_overview: str = Field(..., min_length=1)
    prototype_type: str = Field(..., min_length=1)
    quantity: int = Field(..., ge=1)
    technical_requirements: Optional[str] = None
    dimensions: Optional[Any] = None  # Dict or str
    materials: Optional[str] = None
    pcb_hardware_details: Optional[str] = None
    manufacturing_requirements: Optional[str] = None
    delivery_requirements: Optional[str] = None
    additional_notes: Optional[str] = None
    file_ids: Optional[List[str]] = Field(default_factory=list)
    project_id: Optional[str] = None

class ManufacturingCancelRequest(BaseModel):
    reason: Optional[str] = None

class ClarificationRespondRequest(BaseModel):
    text: Optional[str] = None
    response_text: Optional[str] = None
    attached_file_ids: Optional[List[str]] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def populate_text(cls, values):
        if isinstance(values, dict):
            txt = values.get("text") or values.get("response_text")
            if not txt:
                raise ValueError("text or response_text is required")
            values["text"] = txt
        return values

class AdminRaiseClarificationRequest(BaseModel):
    question: str = Field(..., min_length=1)

class AdminStatusUpdateRequest(BaseModel):
    note: str = Field(..., min_length=1)

class AdminResolveCancellationRequest(BaseModel):
    decision: str = Field(...)  # "approve" or "decline"
    refund_amount: Optional[str] = None  # in rupees, e.g. "5000.00"
    refund_amount_paise: Optional[int] = None
    notes: Optional[str] = None

class AdminConfirmRequirementsRequest(BaseModel):
    notes: Optional[str] = None

class ClarificationItem(BaseModel):
    id: str
    question: str
    raised_by: str
    raised_at: str
    status: str
    response: Optional[Dict[str, Any]] = None

class ClarificationListResponse(BaseModel):
    data: List[ClarificationItem]
    request_id: str

class ClarificationSingleResponse(BaseModel):
    data: ClarificationItem
    request_id: str

class StatusUpdateItem(BaseModel):
    id: str
    note: str
    author: str
    created_at: str

class ManufacturingFileItem(BaseModel):
    id: str
    filename: str
    content_type: str
    size_bytes: int
    scan_status: str
    source: str
    created_at: str

class ManufacturingRequestDetailData(BaseModel):
    id: str
    user_id: str
    project_id: Optional[str] = None
    title: str
    project_overview: str
    prototype_type: str
    quantity: int
    technical_requirements: Optional[str] = None
    dimensions: Optional[Any] = None
    materials: Optional[str] = None
    pcb_hardware_details: Optional[str] = None
    manufacturing_requirements: Optional[str] = None
    delivery_requirements: Optional[str] = None
    additional_notes: Optional[str] = None
    status: str
    cancellation_requested: bool = False
    cancellation_reason: Optional[str] = None
    cancellation_decision: Optional[str] = None
    cancellation_refund_paise: Optional[int] = None
    cancellation_refund_amount: Optional[str] = None
    cancellation_notes: Optional[str] = None
    internal_notes: Optional[str] = None
    files: Dict[str, List[ManufacturingFileItem]] = Field(default_factory=lambda: {"customer_uploaded": [], "delivered": []})
    current_quote: Optional[Dict[str, Any]] = None
    clarifications: List[ClarificationItem] = Field(default_factory=list)
    status_updates: List[StatusUpdateItem] = Field(default_factory=list)
    created_at: str
    updated_at: str

class ManufacturingRequestResponse(BaseModel):
    data: ManufacturingRequestDetailData
    request_id: str

class ManufacturingRequestSummaryData(BaseModel):
    id: str
    title: str
    prototype_type: str
    quantity: int
    status: str
    cancellation_requested: bool = False
    project_id: Optional[str] = None
    open_clarifications_count: int = 0
    created_at: str
    updated_at: str
    days_in_current_status: Optional[int] = None
    customer_email: Optional[str] = None

class ManufacturingRequestListResponse(BaseModel):
    data: List[ManufacturingRequestSummaryData]
    pagination: Dict[str, Any]
    request_id: str

class ManufacturingHistoryEvent(BaseModel):
    type: str
    title: str
    description: Optional[str] = None
    timestamp: str
    actor: str

class ManufacturingHistoryResponse(BaseModel):
    data: List[ManufacturingHistoryEvent]
    request_id: str
