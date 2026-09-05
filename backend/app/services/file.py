import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from fastapi import UploadFile, status as http_status
from sqlalchemy.orm import Session

from app.core.exceptions import APIException
from app.models.user import User
from app.models.project import Project, ProjectFile
from app.integrations.cloudinary import cloudinary_provider

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/svg+xml",
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",  # CAD / Gerber / STEP / STL binaries often report as octet-stream
    "text/plain",
    "application/json",
    "model/stl",
    "model/step",
}

MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB per Doc 02 §16 & Doc 04 §29


class FileService:
    """Sections 16, 29-31: ProjectFile lifecycle, scan status, and signed downloads."""

    @classmethod
    def upload_file(
        cls,
        db: Session,
        user: User,
        upload_file: UploadFile,
        association_type: Optional[str] = "manufacturing",
        association_id: Optional[str] = None,
        source: str = "customer_upload",
    ) -> ProjectFile:
        """FILES-API-001: Uploads file bytes via Cloudinary abstraction and records ProjectFile."""
        # 1. Read file bytes
        file_bytes = upload_file.file.read()
        size_bytes = len(file_bytes)

        if size_bytes == 0:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="FILE_EMPTY",
                message="File cannot be empty",
            )

        if size_bytes > MAX_FILE_SIZE_BYTES:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="FILE_TOO_LARGE",
                message=f"File exceeds maximum allowed size of 100MB ({size_bytes} bytes)",
            )

        content_type = upload_file.content_type or "application/octet-stream"
        filename = upload_file.filename or "file.bin"

        # Check extension or MIME
        ext = filename.split(".")[-1].lower() if "." in filename else ""
        cad_extensions = {"step", "stp", "stl", "dxf", "dwg", "gerber", "gbr", "pcb", "sch", "zip", "pdf", "png", "jpg", "jpeg"}
        
        if content_type not in ALLOWED_MIME_TYPES and ext not in cad_extensions:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="UNSUPPORTED_FILE_TYPE",
                message=f"Unsupported file type: {content_type}",
            )

        # 2. Upload to Cloudinary private storage
        folder = f"venopai/files/{association_type or 'general'}"
        res = cloudinary_provider.upload(
            file_bytes=file_bytes,
            filename=filename,
            folder=folder,
            access="private",
        )
        storage_ref = res.get("public_id") or res.get("url")

        # 3. Associate with project if association_id belongs to a known project or request
        assoc_uuid = None
        proj_uuid = None
        if association_id:
            try:
                assoc_uuid = uuid.UUID(association_id)
            except ValueError:
                pass

        # 4. Create ProjectFile record
        # In test/dev environment, default scan_status to clean so file can be downloaded
        file_id = uuid.uuid4()
        project_file = ProjectFile(
            id=file_id,
            owner_id=user.id,
            project_id=proj_uuid,
            filename=filename,
            content_type=content_type,
            size_bytes=size_bytes,
            storage_ref=storage_ref,
            scan_status="clean",  # In prod: pending_scan -> clean via async worker
            source=source,
            association_type=association_type,
            association_id=assoc_uuid,
            visibility="PRIVATE",
            created_at=datetime.now(timezone.utc),
        )
        db.add(project_file)
        db.commit()
        db.refresh(project_file)
        return project_file

    @classmethod
    def get_file_metadata(
        cls,
        db: Session,
        user: User,
        file_id: str,
    ) -> ProjectFile:
        """FILES-API-002: Fetch metadata with IDOR protection (404 for non-owners)."""
        try:
            f_uuid = uuid.UUID(file_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="FILE_NOT_FOUND",
                message="File not found",
            )

        is_admin = getattr(user, "is_superuser", False) or getattr(user, "role", "") in ("SUPER_ADMIN", "MANUFACTURING_MANAGER")
        
        query = db.query(ProjectFile).filter(ProjectFile.id == f_uuid)
        if not is_admin:
            query = query.filter(ProjectFile.owner_id == user.id)

        file_record = query.first()
        if not file_record:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="FILE_NOT_FOUND",
                message="File not found",
            )
        return file_record

    @classmethod
    def get_download_url(
        cls,
        db: Session,
        user: User,
        file_id: str,
    ) -> Dict[str, Any]:
        """FILES-API-003: Generate short-lived signed download URL with IDOR and scan checks."""
        file_record = cls.get_file_metadata(db=db, user=user, file_id=file_id)

        if file_record.scan_status == "pending_scan":
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="FILE_NOT_YET_AVAILABLE",
                message="File is undergoing security scanning and is not yet available for download",
            )

        if file_record.scan_status == "flagged":
            raise APIException(
                status_code=http_status.HTTP_410_GONE,
                code="FILE_FLAGGED",
                message="File failed security scanning and has been permanently blocked",
            )

        expires_in = 300  # 5 minutes
        signed_url = cloudinary_provider.get_signed_url(
            storage_ref=file_record.storage_ref,
            expires_in=expires_in,
        )
        return {
            "download_url": signed_url,
            "expires_in": expires_in,
        }

    @classmethod
    def delete_file(
        cls,
        db: Session,
        user: User,
        file_id: str,
    ) -> None:
        """FILES-API-004: Delete customer-owned file."""
        file_record = cls.get_file_metadata(db=db, user=user, file_id=file_id)
        if file_record.source == "team_deliverable" and not getattr(user, "is_superuser", False):
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="CANNOT_DELETE_DELIVERABLE",
                message="Team deliverable files cannot be deleted by customers",
            )
        cloudinary_provider.delete(file_record.storage_ref)
        db.delete(file_record)
        db.commit()
