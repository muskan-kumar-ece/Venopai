import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# =========================================================================
# CONSULTATION SCHEMAS
# =========================================================================

class ConsultationCreate(BaseModel):
    topic: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=10)
    file_ids: Optional[List[str]] = Field(default_factory=list)


class ConsultationResponseData(BaseModel):
    id: str
    user_id: str
    project_id: Optional[str] = None
    topic: str
    description: str
    status: str
    converted_quote_id: Optional[str] = None
    admin_response: Optional[str] = None
    files: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    created_at: str
    updated_at: str


class ConsultationResponse(BaseModel):
    data: ConsultationResponseData
    request_id: str


class ConsultationListResponse(BaseModel):
    data: List[ConsultationResponseData]
    total: int
    page: int
    page_size: int
    request_id: str


class ConsultationClarificationCreate(BaseModel):
    question: str = Field(..., min_length=5)


class ConsultationClarificationRespond(BaseModel):
    text: Optional[str] = None
    response_text: Optional[str] = None
    attached_file_ids: Optional[List[str]] = Field(default_factory=list)


class ConsultationClarificationData(BaseModel):
    id: str
    request_id: str
    question: str
    raised_by_id: str
    raised_at: str
    status: str
    response_text: Optional[str] = None
    responded_at: Optional[str] = None
    attached_file_ids: Optional[List[str]] = Field(default_factory=list)


class ConsultationClarificationListResponse(BaseModel):
    data: List[ConsultationClarificationData]
    request_id: str


class AdminConsultationRespond(BaseModel):
    response: Optional[str] = None
    admin_response: Optional[str] = None
    internal_notes: Optional[str] = None


class AdminConsultationConvertToQuote(BaseModel):
    line_items: List[Dict[str, str]]
    shipping_amount: Optional[str] = "0.00"
    destination_state: Optional[str] = None
    estimated_timeline: Optional[str] = None
    valid_until: Optional[str] = None
    terms: Optional[str] = None
    scope_summary: Optional[str] = None


class AdminConsultationClose(BaseModel):
    notes: Optional[str] = None


# =========================================================================
# DESIGN / PCB SCHEMAS
# =========================================================================

class DesignRequestCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    project_overview: str = Field(..., min_length=10)
    design_scope: str = Field(default="pcb_layout")  # schematic_only, pcb_layout, both
    reference_file_ids: Optional[List[str]] = Field(default_factory=list)
    additional_notes: Optional[str] = None


class DesignRequestResponseData(BaseModel):
    id: str
    user_id: str
    project_id: Optional[str] = None
    title: str
    project_overview: str
    design_scope: str
    additional_notes: Optional[str] = None
    status: str
    cancellation_requested: bool = False
    cancellation_decision: Optional[str] = None
    cancellation_refund_paise: Optional[int] = None
    cancellation_notes: Optional[str] = None
    files: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    created_at: str
    updated_at: str


class DesignRequestResponse(BaseModel):
    data: DesignRequestResponseData
    request_id: str


class DesignRequestListResponse(BaseModel):
    data: List[DesignRequestResponseData]
    total: int
    page: int
    page_size: int
    request_id: str


class StartManufacturingDraftData(BaseModel):
    title: str
    project_overview: str
    prototype_type: str = "pcb_assembly"
    quantity: int = 1
    reference_file_ids: List[str] = Field(default_factory=list)
    source_design_request_id: str


class StartManufacturingDraftResponse(BaseModel):
    data: StartManufacturingDraftData
    request_id: str


# =========================================================================
# SOFTWARE / FIRMWARE SCHEMAS
# =========================================================================

class SoftwareRequestCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    project_description: str = Field(..., min_length=10)
    requirements: str = Field(..., min_length=5)
    platform_technology: Optional[str] = None
    reference_file_ids: Optional[List[str]] = Field(default_factory=list)
    additional_notes: Optional[str] = None


class SoftwareRequestResponseData(BaseModel):
    id: str
    user_id: str
    project_id: Optional[str] = None
    title: str
    project_description: str
    requirements: str
    platform_technology: Optional[str] = None
    additional_notes: Optional[str] = None
    status: str
    cancellation_requested: bool = False
    cancellation_decision: Optional[str] = None
    cancellation_refund_paise: Optional[int] = None
    cancellation_notes: Optional[str] = None
    files: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    created_at: str
    updated_at: str


class SoftwareRequestResponse(BaseModel):
    data: SoftwareRequestResponseData
    request_id: str


class SoftwareRequestListResponse(BaseModel):
    data: List[SoftwareRequestResponseData]
    total: int
    page: int
    page_size: int
    request_id: str
