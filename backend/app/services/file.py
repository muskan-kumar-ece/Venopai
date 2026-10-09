import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from fastapi import UploadFile, status as http_status
from sqlalchemy.orm import Session

from app.core.exceptions import APIException
from app.models.user import User
from app.models.project import Project, ProjectFile, ManufacturingRequest
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
    def check_admin_role_for_service(cls, admin: User, request_type: Optional[str]) -> None:
        """Enforce Document 04 §30 / Section 45: Admin access to files is role-scoped."""
        user_role = getattr(admin, "role", "")
        if user_role == "SUPER_ADMIN":
            return

        req_type = (request_type or "").lower()
        if req_type in ("manufacturing", "design", "software", "consultation") and user_role == "MANUFACTURING_MANAGER":
            return

        raise APIException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            code="FORBIDDEN_FILE_ACCESS",
            message="Role does not have permission to access files for this service type",
        )

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
        """FILES-API-001: Uploads file bytes via Cloudinary abstraction and records ProjectFile.
        Contract: Upload initializes scan_status as 'pending_scan' and enqueues malware scan task.
        """
        # 1. Read file bytes in streaming chunks up to MAX_FILE_SIZE_BYTES
        chunks = []
        total_read = 0
        chunk_size = 1024 * 1024  # 1MB chunks
        while True:
            chunk = upload_file.file.read(chunk_size)
            if not chunk:
                break
            total_read += len(chunk)
            if total_read > MAX_FILE_SIZE_BYTES:
                raise APIException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    code="FILE_TOO_LARGE",
                    message="File exceeds maximum allowed size of 100MB",
                )
            chunks.append(chunk)

        file_bytes = b"".join(chunks)
        size_bytes = len(file_bytes)

        if size_bytes == 0:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="FILE_EMPTY",
                message="File cannot be empty",
            )

        content_type = upload_file.content_type or "application/octet-stream"
        filename = upload_file.filename or "file.bin"

        # Check extension or MIME
        ext = filename.split(".")[-1].lower() if "." in filename else ""
        cad_extensions = {
            "step", "stp", "stl", "dxf", "dwg", "gerber", "gbr", "pcb", "sch",
            "kicad_pcb", "kicad_sch", "kicad_pro", "zip", "pdf", "png", "jpg", "jpeg", "csv", "svg"
        }
        
        if content_type not in ALLOWED_MIME_TYPES and ext not in cad_extensions:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="UNSUPPORTED_FILE_TYPE",
                message=f"Unsupported file type: {content_type}",
            )

        # SVG Sanitization against stored XSS
        if content_type == "image/svg+xml" or ext == "svg":
            lower_content = file_bytes[:100000].lower()
            dangerous_patterns = [
                b"<script", b"javascript:", b"onload", b"onerror",
                b"onclick", b"<foreignobject", b"<iframe", b"<embed", b"<object"
            ]
            for pattern in dangerous_patterns:
                if pattern in lower_content:
                    raise APIException(
                        status_code=http_status.HTTP_400_BAD_REQUEST,
                        code="MALICIOUS_SVG_CONTENT",
                        message="SVG file contains prohibited scripts or active event handlers",
                    )

        # 2. Validate association ownership and authorization
        assoc_uuid = None
        if association_id:
            try:
                assoc_uuid = uuid.UUID(association_id)
            except ValueError:
                raise APIException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    code="INVALID_ASSOCIATION_ID",
                    message="association_id must be a valid UUID",
                )

            is_admin_user = (
                getattr(user, "is_superuser", False)
                or getattr(user, "is_admin", False)
                or getattr(user, "role", "") in ("SUPER_ADMIN", "MANUFACTURING_MANAGER")
            )
            if not is_admin_user or source == "customer_upload":
                # Customer ownership validation
                assoc_t = (association_type or "").lower()
                owned = False
                if assoc_t == "manufacturing":
                    owned = db.query(ManufacturingRequest).filter(
                        ManufacturingRequest.id == assoc_uuid,
                        ManufacturingRequest.user_id == user.id,
                    ).first() is not None
                elif assoc_t == "design":
                    from app.models.project import DesignRequest
                    owned = db.query(DesignRequest).filter(
                        DesignRequest.id == assoc_uuid,
                        DesignRequest.user_id == user.id,
                    ).first() is not None
                elif assoc_t == "software":
                    from app.models.project import SoftwareRequest
                    owned = db.query(SoftwareRequest).filter(
                        SoftwareRequest.id == assoc_uuid,
                        SoftwareRequest.user_id == user.id,
                    ).first() is not None
                elif assoc_t == "consultation":
                    from app.models.project import ConsultationRequest
                    owned = db.query(ConsultationRequest).filter(
                        ConsultationRequest.id == assoc_uuid,
                        ConsultationRequest.user_id == user.id,
                    ).first() is not None
                elif assoc_t == "project":
                    owned = db.query(Project).filter(
                        Project.id == assoc_uuid,
                        Project.user_id == user.id,
                    ).first() is not None
                else:
                    owned = False

                if not owned:
                    raise APIException(
                        status_code=http_status.HTTP_404_NOT_FOUND,
                        code="ASSOCIATION_NOT_FOUND",
                        message=f"Request of type '{association_type}' with ID '{association_id}' not found or does not belong to you",
                    )
            else:
                # Admin deliverable validation: check permission for service type
                cls.check_admin_role_for_service(user, association_type)

        # 3. Upload to Cloudinary private storage
        folder = f"venopai/files/{association_type or 'general'}"
        res = cloudinary_provider.upload(
            file_bytes=file_bytes,
            filename=filename,
            folder=folder,
            access="private",
        )
        storage_ref = res.get("public_id") or res.get("url")

        # 4. Create ProjectFile record in 'pending_scan' status (mandatory per Document 04 §31)
        file_id = uuid.uuid4()
        project_file = ProjectFile(
            id=file_id,
            owner_id=user.id,
            filename=filename,
            content_type=content_type,
            size_bytes=size_bytes,
            storage_ref=storage_ref,
            scan_status="pending_scan",  # MUST start in pending_scan
            source=source,
            association_type=association_type,
            association_id=assoc_uuid,
            visibility="PRIVATE",
            created_at=datetime.now(timezone.utc),
        )
        db.add(project_file)
        db.commit()
        db.refresh(project_file)

        # 5. Enqueue Celery malware scan task
        try:
            from app.workers.celery_app import celery_app
            if not getattr(celery_app.conf, "task_always_eager", False):
                from app.workers.tasks.files import scan_file_malware
                scan_file_malware.delay(str(project_file.id))
        except Exception:
            # If celery broker offline in test/dev, task can be invoked manually or runs via worker
            pass

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

        is_admin = getattr(user, "is_superuser", False) or getattr(user, "is_admin", False) or getattr(user, "role", "") in (
            "SUPER_ADMIN", "MANUFACTURING_MANAGER", "ORDER_MANAGER", "SUPPORT_EXECUTIVE", "FINANCE_MANAGER"
        )
        
        file_record = db.query(ProjectFile).filter(ProjectFile.id == f_uuid).first()
        if not file_record:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="FILE_NOT_FOUND",
                message="File not found",
            )

        if not is_admin:
            # Customer ownership check: either direct owner or customer owns associated request
            if file_record.owner_id != user.id:
                # Check if it's a team deliverable for customer's request
                is_owned_request = False
                if file_record.association_type == "manufacturing" and file_record.association_id:
                    mfg = db.query(ManufacturingRequest).filter(
                        ManufacturingRequest.id == file_record.association_id,
                        ManufacturingRequest.user_id == user.id,
                    ).first()
                    if mfg:
                        is_owned_request = True
                
                if not is_owned_request:
                    # Strict IDOR (SEC-009): return 404, never 403
                    raise APIException(
                        status_code=http_status.HTTP_404_NOT_FOUND,
                        code="FILE_NOT_FOUND",
                        message="File not found",
                    )
        else:
            # Role scoping check for admin
            cls.check_admin_role_for_service(user, file_record.association_type)

        return file_record

    @classmethod
    def get_download_url(
        cls,
        db: Session,
        user: User,
        file_id: str,
    ) -> Dict[str, Any]:
        """FILES-API-003: Generate short-lived signed download URL with IDOR and scan checks.
        Contract (Document 04 §29, §31):
        - Unauthorized customer -> 404 (IDOR safe)
        - pending_scan -> 409 FILE_NOT_YET_AVAILABLE
        - flagged -> 410 FILE_FLAGGED
        - failed -> 410 FILE_SCAN_FAILED
        - clean -> 200 signed Cloudinary URL (5 min expiry)
        """
        # Step 1: Enforce identity & IDOR check before any scan status evaluation
        file_record = cls.get_file_metadata(db=db, user=user, file_id=file_id)

        # Step 2: Enforce malware scan gating
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

        if file_record.scan_status == "failed":
            raise APIException(
                status_code=http_status.HTTP_410_GONE,
                code="FILE_SCAN_FAILED",
                message="File scan process failed and file is not available for download",
            )

        if file_record.scan_status != "clean":
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="FILE_NOT_AVAILABLE",
                message="File is not available for download",
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

    @classmethod
    def list_customer_files(
        cls,
        db: Session,
        user: User,
        association_type: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[list, int]:
        """FILES-API-005: List customer uploaded files with pagination and search."""
        query = db.query(ProjectFile).filter(ProjectFile.owner_id == user.id)
        if association_type and association_type != "all":
            query = query.filter(ProjectFile.association_type == association_type.strip().lower())
        if search and search.strip():
            query = query.filter(ProjectFile.filename.ilike(f"%{search.strip()}%"))

        total = query.count()
        files = query.order_by(ProjectFile.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return files, total
