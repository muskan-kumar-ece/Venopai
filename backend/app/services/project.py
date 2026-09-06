import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.core.exceptions import APIException
from app.models.user import User
from app.models.project import (
    Project,
    ProjectFile,
    ManufacturingRequest,
    DesignRequest,
    ConsultationRequest,
    SoftwareRequest,
)

def utcnow():
    return datetime.now(timezone.utc)


class ProjectService:
    """Sections 13-16 & Section 28: Lightweight project grouping and file aggregation."""

    @classmethod
    def create_project(cls, db: Session, user: User, name: str) -> Project:
        """PROJECT-API-002: Create a project with name only."""
        clean_name = name.strip()
        if not clean_name:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="INVALID_PROJECT_NAME",
                message="Project name cannot be empty",
            )
        project = Project(
            id=uuid.uuid4(),
            user_id=user.id,
            name=clean_name,
            created_at=utcnow(),
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        return project

    @classmethod
    def get_project(cls, db: Session, user: User, project_id: str) -> Tuple[Project, List[Dict[str, Any]]]:
        """PROJECT-API-003: Fetch project detail with linked requests (404 IDOR protected)."""
        try:
            p_uuid = uuid.UUID(project_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="PROJECT_NOT_FOUND",
                message="Project not found",
            )

        project = db.query(Project).filter(
            Project.id == p_uuid,
            Project.user_id == user.id,
        ).first()

        if not project:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="PROJECT_NOT_FOUND",
                message="Project not found",
            )

        linked_requests: List[Dict[str, Any]] = []

        # 1. Manufacturing requests
        mfg_reqs = db.query(ManufacturingRequest).filter(
            ManufacturingRequest.project_id == project.id,
            ManufacturingRequest.user_id == user.id,
        ).all()
        for r in mfg_reqs:
            linked_requests.append({
                "type": "manufacturing",
                "id": str(r.id),
                "status": r.status,
                "title": r.title,
                "created_at": r.created_at.isoformat() if r.created_at else "",
            })

        # 2. Design requests
        design_reqs = db.query(DesignRequest).filter(
            DesignRequest.project_id == project.id,
            DesignRequest.user_id == user.id,
        ).all()
        for r in design_reqs:
            linked_requests.append({
                "type": "design",
                "id": str(r.id),
                "status": r.status,
                "title": r.title,
                "created_at": r.created_at.isoformat() if r.created_at else "",
            })

        # 3. Consultation requests
        consult_reqs = db.query(ConsultationRequest).filter(
            ConsultationRequest.project_id == project.id,
            ConsultationRequest.user_id == user.id,
        ).all()
        for r in consult_reqs:
            linked_requests.append({
                "type": "consultation",
                "id": str(r.id),
                "status": r.status,
                "title": r.topic,
                "created_at": r.created_at.isoformat() if r.created_at else "",
            })

        # 4. Software requests
        sw_reqs = db.query(SoftwareRequest).filter(
            SoftwareRequest.project_id == project.id,
            SoftwareRequest.user_id == user.id,
        ).all()
        for r in sw_reqs:
            linked_requests.append({
                "type": "software",
                "id": str(r.id),
                "status": r.status,
                "title": r.title,
                "created_at": r.created_at.isoformat() if r.created_at else "",
            })

        return project, linked_requests

    @classmethod
    def list_projects(cls, db: Session, user: User) -> List[Dict[str, Any]]:
        """PROJECT-API-001: List customer projects with summary statistics."""
        projects = db.query(Project).filter(
            Project.user_id == user.id,
        ).order_by(Project.created_at.desc()).all()

        results = []
        for p in projects:
            mfg_count = db.query(ManufacturingRequest).filter(ManufacturingRequest.project_id == p.id).count()
            design_count = db.query(DesignRequest).filter(DesignRequest.project_id == p.id).count()
            consult_count = db.query(ConsultationRequest).filter(ConsultationRequest.project_id == p.id).count()
            sw_count = db.query(SoftwareRequest).filter(SoftwareRequest.project_id == p.id).count()
            total_count = mfg_count + design_count + consult_count + sw_count

            # Active vs completed
            completed_count = db.query(ManufacturingRequest).filter(
                ManufacturingRequest.project_id == p.id,
                ManufacturingRequest.status.in_(["completed", "delivered"]),
            ).count()
            active_count = total_count - completed_count

            results.append({
                "id": str(p.id),
                "name": p.name,
                "linked_requests_count": total_count,
                "active_requests_count": active_count,
                "completed_requests_count": completed_count,
                "created_at": p.created_at.isoformat() if p.created_at else "",
            })
        return results

    @classmethod
    def update_project(cls, db: Session, user: User, project_id: str, name: str) -> Project:
        """PROJECT-API-004: Rename project with IDOR protection."""
        project, _ = cls.get_project(db=db, user=user, project_id=project_id)
        clean_name = name.strip()
        if not clean_name:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="INVALID_PROJECT_NAME",
                message="Project name cannot be empty",
            )
        project.name = clean_name
        project.updated_at = utcnow()
        db.commit()
        db.refresh(project)
        return project

    @classmethod
    def link_request(
        cls,
        db: Session,
        user: User,
        project_id: str,
        request_type: str,
        request_id: str,
    ) -> None:
        """PROJECT-API-005: Link an existing request to a project with ownership & duplicate guards."""
        project, _ = cls.get_project(db=db, user=user, project_id=project_id)

        try:
            req_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="REQUEST_NOT_FOUND",
                message="Request not found",
            )

        norm_type = request_type.strip().lower()
        if norm_type == "manufacturing":
            req = db.query(ManufacturingRequest).filter(
                ManufacturingRequest.id == req_uuid,
                ManufacturingRequest.user_id == user.id,
            ).first()
            if not req:
                raise APIException(
                    status_code=http_status.HTTP_404_NOT_FOUND,
                    code="REQUEST_NOT_FOUND",
                    message="Manufacturing request not found or not owned by caller",
                )
            if req.project_id == project.id:
                raise APIException(
                    status_code=http_status.HTTP_409_CONFLICT,
                    code="ALREADY_LINKED",
                    message="Request is already linked to this project",
                )
            req.project_id = project.id
            req.updated_at = utcnow()

            # Also associate related project_files with this project for aggregation
            db.query(ProjectFile).filter(
                ProjectFile.association_id == req.id,
                ProjectFile.association_type == "manufacturing",
            ).update({"project_id": project.id})

        elif norm_type == "design":
            d_req = db.query(DesignRequest).filter(
                DesignRequest.id == req_uuid,
                DesignRequest.user_id == user.id,
            ).first()
            if not d_req:
                raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Design request not found or not owned by caller")
            if d_req.project_id == project.id:
                raise APIException(status_code=http_status.HTTP_409_CONFLICT, code="ALREADY_LINKED", message="Request is already linked to this project")
            d_req.project_id = project.id
            d_req.updated_at = utcnow()
            db.query(ProjectFile).filter(
                ProjectFile.association_id == d_req.id,
                ProjectFile.association_type == "design",
            ).update({"project_id": project.id})

        elif norm_type == "consultation":
            c_req = db.query(ConsultationRequest).filter(
                ConsultationRequest.id == req_uuid,
                ConsultationRequest.user_id == user.id,
            ).first()
            if not c_req:
                raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Consultation request not found or not owned by caller")
            if c_req.project_id == project.id:
                raise APIException(status_code=http_status.HTTP_409_CONFLICT, code="ALREADY_LINKED", message="Request is already linked to this project")
            c_req.project_id = project.id
            c_req.updated_at = utcnow()
            db.query(ProjectFile).filter(
                ProjectFile.association_id == c_req.id,
                ProjectFile.association_type == "consultation",
            ).update({"project_id": project.id})

        elif norm_type == "software":
            s_req = db.query(SoftwareRequest).filter(
                SoftwareRequest.id == req_uuid,
                SoftwareRequest.user_id == user.id,
            ).first()
            if not s_req:
                raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Software request not found or not owned by caller")
            if s_req.project_id == project.id:
                raise APIException(status_code=http_status.HTTP_409_CONFLICT, code="ALREADY_LINKED", message="Request is already linked to this project")
            s_req.project_id = project.id
            s_req.updated_at = utcnow()
            db.query(ProjectFile).filter(
                ProjectFile.association_id == s_req.id,
                ProjectFile.association_type == "software",
            ).update({"project_id": project.id})

        else:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="INVALID_REQUEST_TYPE",
                message="request_type must be manufacturing, design, consultation, or software",
            )

        db.commit()

    @classmethod
    def unlink_request(
        cls,
        db: Session,
        user: User,
        project_id: str,
        request_type: str,
        request_id: str,
    ) -> None:
        """PROJECT-API-006: Unlink a request from a project."""
        project, _ = cls.get_project(db=db, user=user, project_id=project_id)
        try:
            req_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        norm_type = request_type.strip().lower()
        if norm_type == "manufacturing":
            req = db.query(ManufacturingRequest).filter(
                ManufacturingRequest.id == req_uuid,
                ManufacturingRequest.project_id == project.id,
                ManufacturingRequest.user_id == user.id,
            ).first()
            if not req:
                raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_LINKED", message="Request is not linked to this project")
            req.project_id = None
            req.updated_at = utcnow()
            db.query(ProjectFile).filter(
                ProjectFile.association_id == req.id,
                ProjectFile.association_type == "manufacturing",
            ).update({"project_id": None})

        elif norm_type == "design":
            d_req = db.query(DesignRequest).filter(
                DesignRequest.id == req_uuid,
                DesignRequest.project_id == project.id,
                DesignRequest.user_id == user.id,
            ).first()
            if not d_req:
                raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_LINKED", message="Request is not linked to this project")
            d_req.project_id = None
            d_req.updated_at = utcnow()
            db.query(ProjectFile).filter(
                ProjectFile.association_id == d_req.id,
                ProjectFile.association_type == "design",
            ).update({"project_id": None})

        elif norm_type == "consultation":
            c_req = db.query(ConsultationRequest).filter(
                ConsultationRequest.id == req_uuid,
                ConsultationRequest.project_id == project.id,
                ConsultationRequest.user_id == user.id,
            ).first()
            if not c_req:
                raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_LINKED", message="Request is not linked to this project")
            c_req.project_id = None
            c_req.updated_at = utcnow()
            db.query(ProjectFile).filter(
                ProjectFile.association_id == c_req.id,
                ProjectFile.association_type == "consultation",
            ).update({"project_id": None})

        elif norm_type == "software":
            s_req = db.query(SoftwareRequest).filter(
                SoftwareRequest.id == req_uuid,
                SoftwareRequest.project_id == project.id,
                SoftwareRequest.user_id == user.id,
            ).first()
            if not s_req:
                raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_LINKED", message="Request is not linked to this project")
            s_req.project_id = None
            s_req.updated_at = utcnow()
            db.query(ProjectFile).filter(
                ProjectFile.association_id == s_req.id,
                ProjectFile.association_type == "software",
            ).update({"project_id": None})

        else:
            raise APIException(status_code=http_status.HTTP_400_BAD_REQUEST, code="INVALID_REQUEST_TYPE", message="Invalid request type")

        db.commit()

    @classmethod
    def get_project_files(cls, db: Session, user: User, project_id: str) -> List[Dict[str, Any]]:
        """PROJECT-API-007: Aggregated file list across every linked request (Doc 03 §32 & Doc 04 §28)."""
        project, linked_requests = cls.get_project(db=db, user=user, project_id=project_id)

        linked_req_ids = [uuid.UUID(r["id"]) for r in linked_requests if r.get("id")]
        if not linked_req_ids:
            return []

        # Aggregated files strictly from all linked requests under this project
        files = db.query(ProjectFile).filter(
            ProjectFile.owner_id == user.id,
            ProjectFile.association_id.in_(linked_req_ids),
        ).order_by(ProjectFile.created_at.desc()).all()

        results = []
        for f in files:
            results.append({
                "id": str(f.id),
                "filename": f.filename,
                "content_type": f.content_type,
                "size_bytes": f.size_bytes,
                "scan_status": f.scan_status,
                "source": f.source,
                "association_type": f.association_type,
                "association_id": str(f.association_id) if f.association_id else None,
                "created_at": f.created_at.isoformat() if f.created_at else "",
            })
        return results
