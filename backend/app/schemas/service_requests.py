import json
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, model_validator


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

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("project_overview") and data.get("project_description"):
                data["project_overview"] = data["project_description"]
            if not data.get("project_overview") and data.get("description"):
                data["project_overview"] = data["description"]
            if not data.get("reference_file_ids") and data.get("file_ids"):
                data["reference_file_ids"] = data["file_ids"]
        return data


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

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # 1. Alias project_description from project_overview or description
            desc = data.get("project_description") or data.get("project_overview") or data.get("description")
            if desc:
                data["project_description"] = desc

            # 2. Derive requirements if omitted or empty
            reqs = data.get("requirements")
            if not reqs or (isinstance(reqs, str) and not reqs.strip()):
                deliv = data.get("deliverables_required") or data.get("deliverables")
                proto = data.get("interfaces_protocols") or data.get("protocols")
                timeline = data.get("target_timeline") or data.get("timeline")
                repo = data.get("repository_url") or data.get("repo_url")

                parts = []
                if deliv:
                    parts.append(f"Deliverables: {deliv}")
                if proto:
                    parts.append(f"Protocols & Interfaces: {proto}")
                if timeline:
                    parts.append(f"Timeline: {timeline}")
                if repo:
                    parts.append(f"Repository: {repo}")

                if parts:
                    data["requirements"] = "\n".join(parts)
                elif desc and len(str(desc).strip()) >= 5:
                    data["requirements"] = f"Implementation and firmware deliverables per functional scope: {str(desc).strip()[:200]}"
                else:
                    data["requirements"] = "Standard firmware engineering deliverables per specification"

            # 3. Map file_ids to reference_file_ids
            if not data.get("reference_file_ids") and data.get("file_ids"):
                data["reference_file_ids"] = data.get("file_ids")

            # 4. Synthesize platform_technology if missing
            if not data.get("platform_technology"):
                tech_parts = [
                    v for v in [
                        data.get("hardware_platform"),
                        data.get("programming_language"),
                        data.get("os_framework")
                    ] if v and str(v).strip()
                ]
                if tech_parts:
                    data["platform_technology"] = " | ".join(str(p).strip() for p in tech_parts)

            # 5. Pack extra technical fields into additional_notes if not explicitly set
            extra_keys = [
                "hardware_platform", "programming_language", "os_framework",
                "interfaces_protocols", "repository_url", "deliverables_required",
                "target_timeline"
            ]
            extras = {k: data[k] for k in extra_keys if k in data and data[k] is not None}
            if extras and not data.get("additional_notes"):
                try:
                    data["additional_notes"] = json.dumps(extras)
                except Exception:
                    pass

        return data


class SoftwareRequestResponseData(BaseModel):
    id: str
    user_id: str
    project_id: Optional[str] = None
    title: str
    project_description: str
    project_overview: Optional[str] = None
    requirements: str
    platform_technology: Optional[str] = None
    hardware_platform: Optional[str] = None
    programming_language: Optional[str] = None
    os_framework: Optional[str] = None
    interfaces_protocols: Optional[str] = None
    repository_url: Optional[str] = None
    deliverables_required: Optional[str] = None
    target_timeline: Optional[str] = None
    target_mcu: Optional[str] = None
    additional_notes: Optional[str] = None
    status: str
    cancellation_requested: bool = False
    cancellation_reason: Optional[str] = None
    cancellation_decision: Optional[str] = None
    cancellation_refund_paise: Optional[int] = None
    cancellation_notes: Optional[str] = None
    files: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    created_at: str
    updated_at: str
    clarifications: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    status_updates: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    active_quote: Optional[Dict[str, Any]] = None
    open_clarifications_count: Optional[int] = 0


class SoftwareRequestResponse(BaseModel):
    data: SoftwareRequestResponseData
    request_id: str


class SoftwareRequestListResponse(BaseModel):
    data: List[SoftwareRequestResponseData]
    total: int
    page: int
    page_size: int
    request_id: str
