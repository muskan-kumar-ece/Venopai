from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)

class ProjectUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)

class ProjectLinkRequest(BaseModel):
    request_type: str = Field(...)  # "manufacturing" | "design" | "consultation" | "software"
    request_id: str = Field(...)

class ProjectUnlinkRequest(BaseModel):
    request_type: str = Field(...)
    request_id: str = Field(...)

class LinkedRequestItem(BaseModel):
    type: str
    id: str
    status: str
    title: str
    created_at: str

class ProjectDetailData(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    linked_requests: List[LinkedRequestItem] = Field(default_factory=list)
    created_at: str
    updated_at: str

class ProjectDetailResponse(BaseModel):
    data: ProjectDetailData
    request_id: str

class ProjectSummaryData(BaseModel):
    id: str
    name: str
    linked_requests_count: int
    active_requests_count: int
    completed_requests_count: int
    created_at: str

class ProjectListResponse(BaseModel):
    data: List[ProjectSummaryData]
    request_id: str

class ProjectFileItem(BaseModel):
    id: str
    filename: str
    content_type: str
    size_bytes: int
    scan_status: str
    source: str
    association_type: Optional[str] = None
    association_id: Optional[str] = None
    created_at: str

class ProjectFilesResponse(BaseModel):
    data: List[ProjectFileItem]
    request_id: str
