import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import func, or_

from app.api.deps import SessionDep, CurrentAdmin
from app.core.config import settings
from app.core.exceptions import get_request_id
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.core.security import (
    verify_password,
    get_password_hash,
    validate_password_strength,
    create_access_token,
    create_refresh_token,
    create_csrf_token,
    hash_token,
)
from app.models.user import User, RefreshToken, AuditEvent
from app.schemas.auth import AdminLogin
from app.core.logging import logger
from pydantic import BaseModel, Field

router = APIRouter()

@router.post("/login", status_code=200)
def admin_login(user_in: AdminLogin, request: Request, response: Response, db: SessionDep):
    request_id = get_request_id(request)
    ip = get_client_ip(request)
    email_norm = user_in.email.lower()

    if not check_rate_limit(f"rl:admin:login:ip:{ip}", limit=10, window_seconds=60) or \
       not check_rate_limit(f"rl:admin:login:email:{email_norm}", limit=5, window_seconds=60):
        raise HTTPException(
            status_code=429,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": "Too many login attempts. Please wait before retrying."},
        )

    user = db.query(User).filter(func.lower(User.email) == email_norm).first()
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_ADMIN_CREDENTIALS", "message": "Invalid admin credentials."},
        )

    ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "ORDER_MANAGER", "MANUFACTURING_MANAGER", "SUPPORT_EXECUTIVE", "FINANCE_MANAGER"]
    if not user.is_superuser and user.role not in ADMIN_ROLES:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_ADMIN_CREDENTIALS", "message": "Invalid admin credentials."},
        )

    if user.status == "deactivated":
        raise HTTPException(
            status_code=403,
            detail={"code": "ACCOUNT_DEACTIVATED", "message": "Account has been deactivated."},
        )

    admin_role = user.role if user.role and user.role != "customer" else "SUPER_ADMIN"
    access_token = create_access_token(
        subject=user.id,
        role=admin_role,
        is_admin=True,
        audience="admin",
        expires_delta=timedelta(minutes=getattr(settings, "ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES", 15)),
    )
    refresh_token = create_refresh_token()
    csrf_token = create_csrf_token()
    family_id = uuid.uuid4()
    expire_date = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    db_token = RefreshToken(
        user_id=user.id,
        token=hash_token(refresh_token),
        family_id=family_id,
        csrf_token=csrf_token,
        expires_at=expire_date,
        revoked=False,
    )
    db.add(db_token)
    db.commit()

    is_secure = request.url.scheme == "https" or settings.ENVIRONMENT == "production"
    response.set_cookie(
        key="admin_refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        path="/api/v1/admin/auth",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
    )
    response.set_cookie(
        key="admin_csrf_token",
        value=csrf_token,
        httponly=False,
        secure=is_secure,
        samesite="lax",
        path="/",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
    )

    return {
        "data": {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": getattr(settings, "ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES", settings.ACCESS_TOKEN_EXPIRE_MINUTES) * 60,
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "status": user.status,
                "is_admin": True,
                "role": admin_role,
            },
        },
        "request_id": request_id,
    }


@router.get("/me", status_code=200)
def admin_me(admin: CurrentAdmin, request: Request):
    """Returns the profile of the currently authenticated admin staff."""
    admin_role = admin.role if admin.role and admin.role != "customer" else "SUPER_ADMIN"
    return {
        "data": {
            "id": str(admin.id),
            "email": admin.email,
            "full_name": admin.full_name,
            "status": admin.status,
            "is_admin": True,
            "role": admin_role,
        },
        "request_id": get_request_id(request),
    }


@router.post("/refresh", status_code=200)
async def admin_refresh(request: Request, response: Response, db: SessionDep):
    """Admin token refresh: exchanges active refresh token for a new access token and rotated refresh token."""
    request_id = get_request_id(request)
    # Admin refresh token strictly required from HttpOnly cookie in production; fallback allowed only in non-production
    refresh_token = request.cookies.get("admin_refresh_token")
    if not refresh_token and settings.ENVIRONMENT != "production":
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            refresh_token = auth_header.split(" ", 1)[1]
        if not refresh_token:
            try:
                body = await request.json()
                if isinstance(body, dict):
                    refresh_token = body.get("refresh_token") or body.get("admin_refresh_token")
            except Exception:
                pass

    if not refresh_token:
        raise HTTPException(
            status_code=401,
            detail={"code": "REFRESH_TOKEN_REQUIRED", "message": "Admin refresh token missing"},
        )
    now = datetime.now(timezone.utc)
    hashed = hash_token(refresh_token)
    token_record = (
        db.query(RefreshToken)
        .filter(or_(RefreshToken.token == hashed, RefreshToken.token == refresh_token))
        .first()
    )
    if not token_record:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_REFRESH_TOKEN", "message": "Refresh token is invalid or expired"},
        )

    # REPLAY / THEFT DETECTION: If a revoked admin token is presented, revoke the entire token family
    if token_record.revoked:
        logger.warning(f"Revoked admin refresh token reuse detected for user {token_record.user_id}, family {token_record.family_id}!")
        db.query(RefreshToken).filter(RefreshToken.family_id == token_record.family_id).update({"revoked": True})
        db.commit()
        response.delete_cookie("admin_refresh_token", path="/api/v1/admin/auth")
        response.delete_cookie("admin_csrf_token", path="/")
        raise HTTPException(
            status_code=401,
            detail={"code": "TOKEN_REUSE_DETECTED", "message": "Admin token reuse detected. All sessions revoked."},
        )

    if token_record.expires_at and token_record.expires_at < now:
        raise HTTPException(
            status_code=401,
            detail={"code": "REFRESH_TOKEN_EXPIRED", "message": "Refresh token has expired"},
        )

    # CSRF validation: If session has a csrf_token attached, validate X-CSRF-Token header
    if token_record.csrf_token:
        csrf_header = request.headers.get("X-CSRF-Token")
        if not csrf_header:
            raise HTTPException(
                status_code=403,
                detail={"code": "CSRF_TOKEN_MISSING", "message": "Missing CSRF token header"},
            )
        if token_record.csrf_token != csrf_header:
            raise HTTPException(
                status_code=403,
                detail={"code": "CSRF_TOKEN_MISMATCH", "message": "Invalid CSRF token"},
            )

    user = db.query(User).filter(User.id == token_record.user_id).first()
    if not user or user.status == "deactivated":
        raise HTTPException(
            status_code=401,
            detail={"code": "USER_NOT_FOUND", "message": "Admin account not found or deactivated"},
        )
    token_record.revoked = True
    new_refresh_token = create_refresh_token()
    new_csrf_token = create_csrf_token()
    expire_date = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    new_db_token = RefreshToken(
        user_id=user.id,
        token=hash_token(new_refresh_token),
        family_id=token_record.family_id or uuid.uuid4(),
        csrf_token=new_csrf_token,
        expires_at=expire_date,
        revoked=False,
    )
    db.add(new_db_token)
    db.commit()

    admin_role = user.role if user.role and user.role != "customer" else "SUPER_ADMIN"
    new_access_token = create_access_token(
        subject=user.id,
        role=admin_role,
        is_admin=True,
        audience="admin",
        expires_delta=timedelta(minutes=getattr(settings, "ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES", 15)),
    )
    is_secure = request.url.scheme == "https" or settings.ENVIRONMENT == "production"
    response.set_cookie(
        key="admin_refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        path="/api/v1/admin/auth",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
    )
    response.set_cookie(
        key="admin_csrf_token",
        value=new_csrf_token,
        httponly=False,
        secure=is_secure,
        samesite="lax",
        path="/",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
    )
    return {
        "data": {
            "access_token": new_access_token,
            "token_type": "bearer",
            "expires_in": getattr(settings, "ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES", 15) * 60,
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "status": user.status,
                "is_admin": True,
                "role": admin_role,
            },
        },
        "request_id": request_id,
    }


@router.post("/logout", status_code=204)
def admin_logout(request: Request, response: Response, db: SessionDep):
    """Admin logout: revokes active refresh token and purges admin cookies."""
    refresh_token = request.cookies.get("admin_refresh_token")
    if refresh_token:
        hashed = hash_token(refresh_token)
        token_record = db.query(RefreshToken).filter(or_(RefreshToken.token == hashed, RefreshToken.token == refresh_token)).first()
        if token_record:
            token_record.revoked = True
            db.commit()
    response.delete_cookie(key="admin_refresh_token", path="/api/v1/admin/auth")
    response.delete_cookie(key="admin_csrf_token", path="/")
    return Response(status_code=204)


class AdminChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, description="Current administrator password")
    new_password: str = Field(..., min_length=10, description="New strong password meeting complexity policy")
    confirm_password: str = Field(..., min_length=10, description="Confirmation of new password")


@router.post("/change-password", status_code=200)
def admin_change_password(
    body: AdminChangePasswordRequest,
    admin: CurrentAdmin,
    request: Request,
    db: SessionDep,
):
    """Admin self-service password change:
    - Verifies current password against stored hash
    - Validates new password complexity and match
    - Ensures new password differs from current password
    - Updates stored bcrypt hash
    - Invalidates all other active refresh sessions across devices
    - Writes immutable AuditEvent
    """
    request_id = get_request_id(request)

    if body.new_password != body.confirm_password:
        raise HTTPException(
            status_code=400,
            detail={"code": "PASSWORD_MISMATCH", "message": "New password and confirmation password do not match."},
        )

    if not verify_password(body.current_password, admin.hashed_password):
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_CURRENT_PASSWORD", "message": "The current password provided is incorrect."},
        )

    if body.new_password == body.current_password:
        raise HTTPException(
            status_code=400,
            detail={"code": "PASSWORD_REUSED", "message": "New password must be different from current password."},
        )

    is_valid, msg = validate_password_strength(body.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=422,
            detail={"code": "WEAK_PASSWORD", "message": msg},
        )

    admin.hashed_password = get_password_hash(body.new_password)
    admin.updated_at = datetime.now(timezone.utc)

    # Invalidate other active refresh sessions so old compromised devices cannot refresh
    current_cookie_refresh = request.cookies.get("admin_refresh_token")
    query = db.query(RefreshToken).filter(
        RefreshToken.user_id == admin.id,
        RefreshToken.revoked == False,
    )
    if current_cookie_refresh:
        query = query.filter(RefreshToken.token != current_cookie_refresh)
    query.update({"revoked": True}, synchronize_session=False)

    audit = AuditEvent(
        user_id=admin.id,
        action="admin.password_changed",
        entity_type="User",
        entity_id=admin.id,
        details={"ip": get_client_ip(request), "email": admin.email},
    )
    db.add(audit)
    db.commit()

    return {
        "data": {
            "message": "Password changed successfully. All other active sessions have been invalidated.",
        },
        "request_id": request_id,
    }
