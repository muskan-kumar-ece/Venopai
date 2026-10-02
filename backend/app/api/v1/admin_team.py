"""Admin Team & Staff Lifecycle Management APIs.
Provides role assignment, administrator creation, password override, and account status control.
Conforms strictly to Document 01 §20, Document 02 §21, Document 03 §47, and Document 04 §40-49.
All endpoints require SUPER_ADMIN authority.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Request, Query, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, desc, or_
from sqlalchemy.orm import Session

from app.api.deps import (
    get_db,
    RequireSuperAdmin,
    CANONICAL_ADMIN_ROLES,
    SessionDep,
)
from app.core.exceptions import get_request_id
from app.core.rate_limit import get_client_ip
from app.core.security import (
    get_password_hash,
    validate_password_strength,
    generate_secure_password,
)
from app.models.user import User, RefreshToken, AuditEvent

router = APIRouter()


class StaffCreateRequest(BaseModel):
    email: EmailStr = Field(..., description="Staff member work email")
    full_name: str = Field(..., min_length=2, max_length=150, description="Full name")
    phone: Optional[str] = Field(None, max_length=50, description="Contact phone number")
    role: str = Field(..., description="Assigned administrative role")
    password: Optional[str] = Field(None, min_length=10, description="Initial password or auto-generated if omitted")


class StaffRoleUpdateRequest(BaseModel):
    role: str = Field(..., description="New administrative role")


class StaffStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="Account status: 'verified' or 'deactivated'")


class StaffResetPasswordRequest(BaseModel):
    new_password: Optional[str] = Field(None, min_length=10, description="Optional override password; generated if omitted")


def _get_active_superadmin_count(db: Session) -> int:
    return (
        db.query(User)
        .filter(
            or_(User.role == "SUPER_ADMIN", User.is_superuser == True),
            User.status != "deactivated",
            User.is_active == True,
        )
        .count()
    )


def _serialize_staff(user: User, db: Session) -> Dict[str, Any]:
    latest_token = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id)
        .order_by(desc(RefreshToken.created_at))
        .first()
    )
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name or "",
        "phone": user.phone or "",
        "role": user.role,
        "status": user.status,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        "last_login_at": latest_token.created_at.isoformat() if latest_token else None,
    }


@router.get("", summary="ADMIN-TEAM-API-001: List all team staff members")
def list_team_staff(
    request: Request,
    admin: RequireSuperAdmin,
    role: Optional[str] = Query(None, description="Filter by administrative role"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status (verified/deactivated)"),
    search: Optional[str] = Query(None, description="Search by name or email"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(User).filter(User.role != "customer")

    if role:
        query = query.filter(User.role == role)
    if status_filter:
        query = query.filter(User.status == status_filter)
    if search:
        s = f"%{search.strip().lower()}%"
        query = query.filter(or_(func.lower(User.email).like(s), func.lower(User.full_name).like(s)))

    total = query.count()
    users = (
        query.order_by(desc(User.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = [_serialize_staff(u, db) for u in users]
    return {
        "data": items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if total > 0 else 1,
        },
        "request_id": get_request_id(request),
    }


@router.post("", status_code=201, summary="ADMIN-TEAM-API-002: Create/invite a new administrator")
def create_team_staff(
    body: StaffCreateRequest,
    request: Request,
    admin: RequireSuperAdmin,
    db: Session = Depends(get_db),
):
    email_norm = body.email.strip().lower()
    role_norm = body.role.strip()

    if role_norm not in CANONICAL_ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_ADMIN_ROLE",
                "message": f"Role must be one of: {', '.join(CANONICAL_ADMIN_ROLES)}",
            },
        )

    existing = db.query(User).filter(func.lower(User.email) == email_norm).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "EMAIL_ALREADY_EXISTS",
                "message": f"An account with email '{email_norm}' already exists.",
            },
        )

    initial_password = body.password
    generated = False
    if not initial_password:
        initial_password = generate_secure_password(14)
        generated = True
    else:
        is_valid, msg = validate_password_strength(initial_password)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "WEAK_PASSWORD", "message": msg},
            )

    is_su = (role_norm == "SUPER_ADMIN")
    hashed_pwd = get_password_hash(initial_password)

    new_staff = User(
        email=email_norm,
        full_name=body.full_name.strip(),
        phone=body.phone.strip() if body.phone else None,
        hashed_password=hashed_pwd,
        role=role_norm,
        status="verified",
        is_active=True,
        is_superuser=is_su,
    )
    db.add(new_staff)
    db.flush()

    audit = AuditEvent(
        user_id=admin.id,
        action="admin.staff_created",
        entity_type="User",
        entity_id=new_staff.id,
        details={
            "created_by": str(admin.id),
            "email": email_norm,
            "role": role_norm,
            "ip": get_client_ip(request),
        },
    )
    db.add(audit)
    db.commit()

    serialized = _serialize_staff(new_staff, db)
    return {
        "data": {
            **serialized,
            "temporary_password": initial_password,
            "password_generated": generated,
        },
        "request_id": get_request_id(request),
    }


@router.get("/{admin_id}", summary="ADMIN-TEAM-API-003: Get staff profile & audit history")
def get_team_staff(
    admin_id: uuid.UUID,
    request: Request,
    admin: RequireSuperAdmin,
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == admin_id, User.role != "customer").first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAFF_NOT_FOUND", "message": "Staff member not found."},
        )

    recent_audits = (
        db.query(AuditEvent)
        .filter(or_(AuditEvent.user_id == target.id, AuditEvent.entity_id == target.id))
        .order_by(desc(AuditEvent.created_at))
        .limit(10)
        .all()
    )

    audit_items = [
        {
            "id": str(a.id),
            "action": a.action,
            "entity_type": a.entity_type,
            "details": a.details,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in recent_audits
    ]

    return {
        "data": {
            **_serialize_staff(target, db),
            "audit_trail": audit_items,
        },
        "request_id": get_request_id(request),
    }


@router.patch("/{admin_id}/role", summary="ADMIN-TEAM-API-004: Update staff role")
def update_staff_role(
    admin_id: uuid.UUID,
    body: StaffRoleUpdateRequest,
    request: Request,
    admin: RequireSuperAdmin,
    db: Session = Depends(get_db),
):
    role_norm = body.role.strip()
    if role_norm not in CANONICAL_ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_ADMIN_ROLE",
                "message": f"Role must be one of: {', '.join(CANONICAL_ADMIN_ROLES)}",
            },
        )

    target = db.query(User).filter(User.id == admin_id, User.role != "customer").first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAFF_NOT_FOUND", "message": "Staff member not found."},
        )

    # Invariant: SuperAdmin cannot demote their own account
    if target.id == admin.id and role_norm != "SUPER_ADMIN":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "SELF_DEMOTION_FORBIDDEN",
                "message": "You cannot remove SUPER_ADMIN privileges from your own account.",
            },
        )

    # Invariant: At least 1 active SUPER_ADMIN must remain
    if target.role == "SUPER_ADMIN" and role_norm != "SUPER_ADMIN":
        active_count = _get_active_superadmin_count(db)
        if active_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "LAST_SUPERADMIN_DEMOTION_FORBIDDEN",
                    "message": "Cannot demote the last remaining active SUPER_ADMIN.",
                },
            )

    old_role = target.role
    target.role = role_norm
    target.is_superuser = (role_norm == "SUPER_ADMIN")
    target.updated_at = datetime.now(timezone.utc)

    audit = AuditEvent(
        user_id=admin.id,
        action="admin.role_updated",
        entity_type="User",
        entity_id=target.id,
        details={
            "old_role": old_role,
            "new_role": role_norm,
            "updated_by": str(admin.id),
            "ip": get_client_ip(request),
        },
    )
    db.add(audit)
    db.commit()

    return {
        "data": _serialize_staff(target, db),
        "request_id": get_request_id(request),
    }


@router.patch("/{admin_id}/status", summary="ADMIN-TEAM-API-005: Suspend or reactivate staff")
def update_staff_status(
    admin_id: uuid.UUID,
    body: StaffStatusUpdateRequest,
    request: Request,
    admin: RequireSuperAdmin,
    db: Session = Depends(get_db),
):
    status_norm = body.status.strip().lower()
    if status_norm not in ("verified", "deactivated"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_STATUS",
                "message": "Status must be either 'verified' (active) or 'deactivated' (suspended).",
            },
        )

    target = db.query(User).filter(User.id == admin_id, User.role != "customer").first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAFF_NOT_FOUND", "message": "Staff member not found."},
        )

    # Invariant: SuperAdmin cannot deactivate themselves
    if target.id == admin.id and status_norm == "deactivated":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "SELF_DEACTIVATION_FORBIDDEN",
                "message": "You cannot deactivate your own administrative account.",
            },
        )

    # Invariant: Last SuperAdmin cannot be deactivated
    if target.role == "SUPER_ADMIN" and status_norm == "deactivated":
        active_count = _get_active_superadmin_count(db)
        if active_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "LAST_SUPERADMIN_DEACTIVATION_FORBIDDEN",
                    "message": "Cannot deactivate the last remaining active SUPER_ADMIN.",
                },
            )

    old_status = target.status
    target.status = status_norm
    target.is_active = (status_norm == "verified")
    target.updated_at = datetime.now(timezone.utc)

    # If deactivating, instantly revoke all active refresh tokens for this user
    if status_norm == "deactivated":
        db.query(RefreshToken).filter(
            RefreshToken.user_id == target.id,
            RefreshToken.revoked == False,
        ).update({"revoked": True}, synchronize_session=False)

    audit = AuditEvent(
        user_id=admin.id,
        action="admin.status_updated",
        entity_type="User",
        entity_id=target.id,
        details={
            "old_status": old_status,
            "new_status": status_norm,
            "updated_by": str(admin.id),
            "ip": get_client_ip(request),
        },
    )
    db.add(audit)
    db.commit()

    return {
        "data": _serialize_staff(target, db),
        "request_id": get_request_id(request),
    }


@router.post("/{admin_id}/reset-password", summary="ADMIN-TEAM-API-006: Override/reset staff password")
def reset_staff_password(
    admin_id: uuid.UUID,
    body: StaffResetPasswordRequest,
    request: Request,
    admin: RequireSuperAdmin,
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == admin_id, User.role != "customer").first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAFF_NOT_FOUND", "message": "Staff member not found."},
        )

    new_pwd = body.new_password
    generated = False
    if not new_pwd:
        new_pwd = generate_secure_password(14)
        generated = True
    else:
        is_valid, msg = validate_password_strength(new_pwd)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "WEAK_PASSWORD", "message": msg},
            )

    target.hashed_password = get_password_hash(new_pwd)
    target.updated_at = datetime.now(timezone.utc)

    # Invalidate all existing refresh tokens so staff must log in with new password
    db.query(RefreshToken).filter(
        RefreshToken.user_id == target.id,
        RefreshToken.revoked == False,
    ).update({"revoked": True}, synchronize_session=False)

    audit = AuditEvent(
        user_id=admin.id,
        action="admin.password_reset_by_superadmin",
        entity_type="User",
        entity_id=target.id,
        details={
            "reset_by": str(admin.id),
            "password_generated": generated,
            "ip": get_client_ip(request),
        },
    )
    db.add(audit)
    db.commit()

    return {
        "data": {
            "message": "Staff password successfully reset. All active sessions have been terminated.",
            "temporary_password": new_pwd,
            "password_generated": generated,
            "staff_id": str(target.id),
            "email": target.email,
        },
        "request_id": get_request_id(request),
    }
