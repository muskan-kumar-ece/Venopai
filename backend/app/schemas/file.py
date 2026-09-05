from typing import Optional, Dict, Any
from pydantic import BaseModel

class FileMetadata(BaseModel):
    id: str
    filename: str
    content_type: str
    size_bytes: int
    scan_status: str
    source: str
    association_type: Optional[str] = None
    association_id: Optional[str] = None
    created_at: str

class FileUploadResponse(BaseModel):
    data: FileMetadata
    request_id: str

class FileMetadataResponse(BaseModel):
    data: FileMetadata
    request_id: str

class FileDownloadData(BaseModel):
    download_url: str
    expires_in: int

class FileDownloadResponse(BaseModel):
    data: FileDownloadData
    request_id: str
