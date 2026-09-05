import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser
from app.services.project import ProjectService
from app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectLinkRequest,
    ProjectUnlinkRequest,
    ProjectDetailResponse,
    ProjectListResponse,
    ProjectFilesResponse,
)

router = APIRouter()


@router.get(
    "",
    response_model=ProjectListResponse,
    status_code=http_status.HTTP_200_OK,
    summary="PROJECT-API-001: List the customer's projects",
)
def list_projects(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """List customer projects with linked request statistics."""
    items = ProjectService.list_projects(db=db, user=current_user)
    return {
        "data": items,
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "",
    response_model=ProjectDetailResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="PROJECT-API-002: Create a project (name only)",
)
def create_project(
    body: ProjectCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Create a new project container with name only."""
    project = ProjectService.create_project(db=db, user=current_user, name=body.name)
    return {
        "data": {
            "id": str(project.id),
            "name": project.name,
            "description": project.description,
            "linked_requests": [],
            "created_at": project.created_at.isoformat() if project.created_at else "",
            "updated_at": project.updated_at.isoformat() if project.updated_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{id}",
    response_model=ProjectDetailResponse,
    status_code=http_status.HTTP_200_OK,
    summary="PROJECT-API-003: Project detail with linked requests",
)
def get_project_detail(
    id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Get project detail with all linked service requests (404 IDOR protected)."""
    project, linked_requests = ProjectService.get_project(db=db, user=current_user, project_id=id)
    return {
        "data": {
            "id": str(project.id),
            "name": project.name,
            "description": project.description,
            "linked_requests": linked_requests,
            "created_at": project.created_at.isoformat() if project.created_at else "",
            "updated_at": project.updated_at.isoformat() if project.updated_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.patch(
    "/{id}",
    response_model=ProjectDetailResponse,
    status_code=http_status.HTTP_200_OK,
    summary="PROJECT-API-004: Rename project",
)
def update_project(
    id: str,
    body: ProjectUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Rename a project container."""
    project = ProjectService.update_project(db=db, user=current_user, project_id=id, name=body.name)
    _, linked_requests = ProjectService.get_project(db=db, user=current_user, project_id=id)
    return {
        "data": {
            "id": str(project.id),
            "name": project.name,
            "description": project.description,
            "linked_requests": linked_requests,
            "created_at": project.created_at.isoformat() if project.created_at else "",
            "updated_at": project.updated_at.isoformat() if project.updated_at else "",
        },
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/link",
    status_code=http_status.HTTP_200_OK,
    summary="PROJECT-API-005: Link an existing request to this project",
)
def link_request_to_project(
    id: str,
    body: ProjectLinkRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Link a customer's request to a project container with ownership & duplicate guards."""
    ProjectService.link_request(
        db=db,
        user=current_user,
        project_id=id,
        request_type=body.request_type,
        request_id=body.request_id,
    )
    return {
        "status": "success",
        "message": "Request linked to project successfully",
        "request_id": str(uuid.uuid4()),
    }


@router.post(
    "/{id}/unlink",
    status_code=http_status.HTTP_200_OK,
    summary="PROJECT-API-006: Unlink a request from this project",
)
def unlink_request_from_project(
    id: str,
    body: ProjectUnlinkRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Unlink a request from a project."""
    ProjectService.unlink_request(
        db=db,
        user=current_user,
        project_id=id,
        request_type=body.request_type,
        request_id=body.request_id,
    )
    return {
        "status": "success",
        "message": "Request unlinked from project successfully",
        "request_id": str(uuid.uuid4()),
    }


@router.get(
    "/{id}/files",
    response_model=ProjectFilesResponse,
    status_code=http_status.HTTP_200_OK,
    summary="PROJECT-API-007: Aggregated file list across every linked request",
)
def get_project_files(
    id: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Aggregated file list across all linked requests within this project."""
    files = ProjectService.get_project_files(db=db, user=current_user, project_id=id)
    return {
        "data": files,
        "request_id": str(uuid.uuid4()),
    }
