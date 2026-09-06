import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import func

from app.api.deps import SessionDep
from app.core.config import settings
from app.core.exceptions import get_request_id
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    create_csrf_token,
)
from app.models.user import User, RefreshToken
from app.schemas.auth import AdminLogin

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
    )
    refresh_token = create_refresh_token()
    csrf_token = create_csrf_token()
    family_id = uuid.uuid4()
    expire_date = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    db_token = RefreshToken(
        user_id=user.id,
        token=refresh_token,
        family_id=family_id,
        csrf_token=csrf_token,
        expires_at=expire_date,
        revoked=False,
    )
    db.add(db_token)
    db.commit()

    response.set_cookie(
        key="admin_refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/api/v1/admin/auth",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
    )
    response.set_cookie(
        key="admin_csrf_token",
        value=csrf_token,
        httponly=False,
        secure=True,
        samesite="strict",
        path="/api/v1/admin/auth",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
    )

    return {
        "data": {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
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
