import uuid
import math
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, UploadFile, File, Form, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, CurrentAdmin
from app.core.exceptions import APIException
from app.core.rate_limit import RateLimiter
from app.models.user import User
from app.models.project import ProjectFile
from app.services.file import FileService
from app.schemas.file import (
    FileUploadResponse,
    FileMetadataResponse,
    FileDownloadResponse,
    FileMetadata,
)

router = APIRouter()
admin_router = APIRouter()


@router.post(
    "",
    response_model=FileUploadResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="FILES-API-001: Upload private file",
    dependencies=[Depends(RateLimiter(limit=10, window_seconds=600, key_prefix="rl:upload", scope="user"))],
)
async def upload_file(

    file: UploadFile = File(...),
    association_type: Optional[str] = Form("manufacturing"),
    association_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Uploads file bytes via Cloudinary abstraction and records ProjectFile."""
    project_file = FileService.upload_file(
        db=db,
        user=current_user,
        upload_file=file,
        association_type=association_type,
        association_id=association_id,
        source="customer_upload",
    )
    return {
        "data": {
            "id": str(project_file.id),
            "filename": project_file.filename,
            "content_type": project_file.content_type,
            "size_bytes": project_file.size_bytes,
            "scan_status": project_file.scan_status,
            "source": project_file.source,
            "association_type": project_file.association_type,
            "association_id": str(project_file.association_id) if project_file.association_id else None,
            "created_at": project_file.created_at.isoformat() if project_file.created_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "",
    status_code=http_status.HTTP_200_OK,
    summary="FILES-API-005: List customer uploaded project files",
)
def list_files(
    current_user: User = Depends(get_current_user),
    association_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Lists files owned by the authenticated customer with pagination and search."""
    files, total = FileService.list_customer_files(
        db=db,
        user=current_user,
        association_type=association_type,
        search=search,
        page=page,
        page_size=page_size,
    )
    return {
        "data": [
            {
                "id": str(f.id),
                "filename": f.filename,
                "file_name": f.filename,
                "content_type": f.content_type,
                "file_size": f.size_bytes,
                "size_bytes": f.size_bytes,
                "scan_status": f.scan_status,
                "source": f.source,
                "association_type": f.association_type,
                "association_id": str(f.association_id) if f.association_id else None,
                "created_at": f.created_at.isoformat() if f.created_at else "",
            }
            for f in files
        ],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": max(1, math.ceil(total / page_size)),
        },
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{file_id}",
    response_model=FileMetadataResponse,
    status_code=http_status.HTTP_200_OK,
    summary="FILES-API-002: Fetch file metadata",
)
def get_file_metadata(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve metadata for customer-owned file with strict IDOR protection."""
    project_file = FileService.get_file_metadata(
        db=db,
        user=current_user,
        file_id=file_id,
    )
    return {
        "data": {
            "id": str(project_file.id),
            "filename": project_file.filename,
            "content_type": project_file.content_type,
            "size_bytes": project_file.size_bytes,
            "scan_status": project_file.scan_status,
            "source": project_file.source,
            "association_type": project_file.association_type,
            "association_id": str(project_file.association_id) if project_file.association_id else None,
            "created_at": project_file.created_at.isoformat() if project_file.created_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{file_id}/download",
    response_model=FileDownloadResponse,
    status_code=http_status.HTTP_200_OK,
    summary="FILES-API-003: Obtain short-lived signed download URL",
)
def download_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generates temporary signed download URL (5m expiry) if malware scan is clean."""
    res = FileService.get_download_url(
        db=db,
        user=current_user,
        file_id=file_id,
    )
    return {
        "data": res,
        "request_id": str(uuid.uuid4()),
    }


@router.delete(
    "/{file_id}",
    status_code=http_status.HTTP_200_OK,
    summary="FILES-API-004: Delete customer-owned file",
)
def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deletes customer-owned file record and Cloudinary asset."""
    FileService.delete_file(
        db=db,
        user=current_user,
        file_id=file_id,
    )
    return {
        "data": {"deleted": True},
        "request_id": str(uuid.uuid4()),
    }


# =========================================================================
# ADMIN FILE ENDPOINTS (ADMIN-FILES-API-001..003)
# =========================================================================

def _check_admin_file_role(admin: User, request_type: str):
    user_role = getattr(admin, "role", "")
    if user_role == "SUPER_ADMIN":
        return
    norm_req = request_type.strip().lower()
    if norm_req in ("manufacturing", "design", "software", "consultation") and user_role == "MANUFACTURING_MANAGER":
        return
    raise APIException(
        status_code=http_status.HTTP_403_FORBIDDEN,
        code="FORBIDDEN_FILE_ACCESS",
        message="Role does not have permission to access files for this service type",
    )


@admin_router.get(
    "/files",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-FILES-API-004: Cross-request file browser",
)
def admin_list_all_files(
    admin: CurrentAdmin,
    scan_status: Optional[str] = Query(None),
    association_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List all files uploaded across requests with scan status and metadata."""
    query = db.query(ProjectFile)
    if scan_status:
        query = query.filter(ProjectFile.scan_status == scan_status)
    if association_type:
        query = query.filter(ProjectFile.association_type == association_type)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(ProjectFile.filename.ilike(s))

    total = query.count()
    files = (
        query.order_by(ProjectFile.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "data": [
            {
                "id": str(f.id),
                "filename": f.filename,
                "content_type": f.content_type,
                "size_bytes": f.size_bytes,
                "scan_status": f.scan_status,
                "source": f.source,
                "association_type": f.association_type,
                "association_id": str(f.association_id) if f.association_id else None,
                "created_at": f.created_at.isoformat() if f.created_at else "",
            }
            for f in files
        ],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": max(1, math.ceil(total / page_size)),
        },
        "request_id": str(uuid.uuid4()),
    }


@admin_router.get(
    "/requests/{request_type}/{request_id}/files",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-FILES-API-001: List files for service request",
)
def admin_list_request_files(
    request_type: str,
    request_id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """List customer and team files associated with a service request."""
    _check_admin_file_role(admin, request_type)
    try:
        req_uuid = uuid.UUID(request_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="REQUEST_NOT_FOUND",
            message="Request not found",
        )
    files = (
        db.query(ProjectFile)
        .filter(
            ProjectFile.association_type == request_type,
            ProjectFile.association_id == req_uuid,
        )
        .all()
    )
    return {
        "data": [
            {
                "id": str(f.id),
                "filename": f.filename,
                "content_type": f.content_type,
                "size_bytes": f.size_bytes,
                "scan_status": f.scan_status,
                "source": f.source,
                "association_type": f.association_type,
                "association_id": str(f.association_id) if f.association_id else None,
                "created_at": f.created_at.isoformat() if f.created_at else "",
            }
            for f in files
        ],
        "request_id": str(uuid.uuid4()),
    }


@admin_router.post(
    "/requests/{request_type}/{request_id}/deliverables",
    response_model=FileUploadResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="ADMIN-FILES-API-002: Upload team deliverable file",
)
async def admin_upload_deliverable(
    request_type: str,
    request_id: str,
    file: UploadFile = File(...),
    admin: CurrentAdmin = None,
    db: Session = Depends(get_db),
):
    """Uploads team deliverable file (CAD, GERBER, report, etc.) for request."""
    _check_admin_file_role(admin, request_type)
    project_file = FileService.upload_file(
        db=db,
        user=admin,
        upload_file=file,
        association_type=request_type,
        association_id=request_id,
        source="team_deliverable",
    )
    return {
        "data": {
            "id": str(project_file.id),
            "filename": project_file.filename,
            "content_type": project_file.content_type,
            "size_bytes": project_file.size_bytes,
            "scan_status": project_file.scan_status,
            "source": project_file.source,
            "association_type": project_file.association_type,
            "association_id": str(project_file.association_id) if project_file.association_id else None,
            "created_at": project_file.created_at.isoformat() if project_file.created_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@admin_router.get(
    "/files/{file_id}/download",
    response_model=FileDownloadResponse,
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-FILES-API-003: Admin download signed URL",
)
def admin_download_file(
    file_id: str,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Generates signed download URL for admin."""
    res = FileService.get_download_url(
        db=db,
        user=admin,
        file_id=file_id,
    )
    return {
        "data": res,
        "request_id": str(uuid.uuid4()),
    }


@admin_router.get(
    "/files/pending-scan",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-FILES-API-005: List files pending virus/malware scan",
)
def admin_list_pending_scan(
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """List project files whose scan status is pending."""
    files = db.query(ProjectFile).filter(ProjectFile.scan_status == "pending").order_by(ProjectFile.created_at.desc()).all()
    return {
        "data": [
            {
                "id": str(f.id),
                "filename": f.filename,
                "content_type": f.content_type,
                "size_bytes": f.size_bytes,
                "scan_status": f.scan_status,
                "source": f.source,
                "created_at": f.created_at.isoformat() if f.created_at else "",
            }
            for f in files
        ],
        "request_id": str(uuid.uuid4()),
    }


@admin_router.post(
    "/files/{file_id}/override-scan",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-FILES-API-006: Manually override file scan status",
)
def admin_override_scan(
    file_id: str,
    body: Dict[str, Any],
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Admin overrides malware scan verdict (e.g. false positive)."""
    try:
        f_uuid = uuid.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="File not found")

    file_obj = db.query(ProjectFile).filter(ProjectFile.id == f_uuid).first()
    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")

    new_status = body.get("status", "clean")
    if new_status not in ("clean", "flagged", "pending"):
        raise HTTPException(status_code=400, detail="Invalid status. Must be clean, flagged, or pending.")

    file_obj.scan_status = new_status
    db.commit()
    db.refresh(file_obj)

    return {
        "data": {
            "id": str(file_obj.id),
            "filename": file_obj.filename,
            "scan_status": file_obj.scan_status,
            "overridden_by": str(admin.id),
        },
        "request_id": str(uuid.uuid4()),
    }
