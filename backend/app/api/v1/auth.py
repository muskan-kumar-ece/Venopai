import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import SessionDep, CurrentUser
from app.core.config import settings
from app.core.exceptions import get_request_id
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    create_csrf_token,
    create_opaque_token,
    hash_token,
)
from app.models.user import User, RefreshToken, EmailVerificationToken, PasswordResetToken
from app.schemas.auth import (
    UserCreate,
    UserLogin,
    VerifyEmail,
    ResendVerification,
    ForgotPassword,
    ResetPassword,
)
from app.workers.tasks.auth import send_verification_email_task, send_password_reset_email_task
from app.core.logging import logger

router = APIRouter()

def is_expired(dt: datetime) -> bool:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt < datetime.now(timezone.utc)

@router.post("/register", status_code=201)
def register(user_in: UserCreate, request: Request, db: SessionDep):
    request_id = get_request_id(request)
    ip = get_client_ip(request)
    if not check_rate_limit(f"rl:register:{ip}", limit=10, window_seconds=3600):
        raise HTTPException(
            status_code=429,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": "Too many registration attempts. Please try again later."},
        )

    # Case-insensitive email uniqueness check
    existing_user = db.query(User).filter(func.lower(User.email) == user_in.email.lower()).first()
    if existing_user:
        raise HTTPException(
            status_code=409,
            detail={"code": "EMAIL_ALREADY_EXISTS", "message": "An account with this email already exists."},
        )

    user = User(
        email=user_in.email.lower(),
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        phone=user_in.phone,
        status="registered",
        role="customer",
    )
    db.add(user)
    db.flush()

    # Generate single-use, time-limited verification token
    raw_token = create_opaque_token()
    token_hash = hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS)
    ver_token = EmailVerificationToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        used=False,
    )
    db.add(ver_token)
    db.commit()
    db.refresh(user)

    # Enqueue verification email through Celery
    try:
        send_verification_email_task.delay(user.email, raw_token, user.full_name)
    except Exception as e:
        logger.warning(f"Failed to enqueue verification email via Celery: {e}")

    return {
        "data": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "status": user.status,
            "created_at": user.created_at.isoformat() if user.created_at else datetime.now(timezone.utc).isoformat(),
        },
        "request_id": request_id,
    }

@router.post("/verify-email", status_code=200)
def verify_email(data: VerifyEmail, request: Request, db: SessionDep):
    request_id = get_request_id(request)
    ip = get_client_ip(request)
    if not check_rate_limit(f"rl:verify:{ip}", limit=30, window_seconds=3600):
        raise HTTPException(
            status_code=429,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": "Too many verification attempts."},
        )

    token_hash = hash_token(data.token)
    token_record = db.query(EmailVerificationToken).filter(EmailVerificationToken.token_hash == token_hash).first()

    if not token_record or is_expired(token_record.expires_at):
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_OR_EXPIRED_TOKEN", "message": "Verification token is invalid or has expired."},
        )

    if token_record.used:
        raise HTTPException(
            status_code=400,
            detail={"code": "TOKEN_ALREADY_USED", "message": "This verification token has already been used."},
        )

    user = token_record.user
    if user:
        user.status = "verified"
    token_record.used = True
    db.commit()

    return {"data": {"status": "verified"}, "request_id": request_id}

@router.post("/resend-verification", status_code=202)
def resend_verification(data: ResendVerification, request: Request, db: SessionDep):
    request_id = get_request_id(request)
    ip = get_client_ip(request)
    email_norm = data.email.lower()

    if not check_rate_limit(f"rl:resend:email:{email_norm}", limit=3, window_seconds=3600) or \
       not check_rate_limit(f"rl:resend:ip:{ip}", limit=10, window_seconds=3600):
        raise HTTPException(
            status_code=429,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": "Too many resend attempts. Please wait before retrying."},
        )

    user = db.query(User).filter(func.lower(User.email) == email_norm).first()
    if user and user.status == "registered":
        # Invalidate previous unused verification tokens
        db.query(EmailVerificationToken).filter(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used == False,
        ).update({"used": True})

        raw_token = create_opaque_token()
        token_hash = hash_token(raw_token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS)
        ver_token = EmailVerificationToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            used=False,
        )
        db.add(ver_token)
        db.commit()

        try:
            send_verification_email_task.delay(user.email, raw_token, user.full_name)
        except Exception as e:
            logger.warning(f"Failed to enqueue resend verification email via Celery: {e}")

    # Always return 202 enumeration-safe response
    return {
        "data": {"message": "If an account exists, a verification email has been sent."},
        "request_id": request_id,
    }

@router.post("/login", status_code=200)
def login(user_in: UserLogin, request: Request, response: Response, db: SessionDep):
    request_id = get_request_id(request)
    ip = get_client_ip(request)
    email_norm = user_in.email.lower()

    if not check_rate_limit(f"rl:login:ip:{ip}", limit=20, window_seconds=60) or \
       not check_rate_limit(f"rl:login:email:{email_norm}", limit=5, window_seconds=60):
        raise HTTPException(
            status_code=429,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": "Too many login attempts. Please wait before retrying."},
        )

    user = db.query(User).filter(func.lower(User.email) == email_norm).first()
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password."},
        )

    if user.status == "deactivated":
        raise HTTPException(
            status_code=403,
            detail={"code": "ACCOUNT_DEACTIVATED", "message": "Account has been deactivated."},
        )

    access_token = create_access_token(
        subject=user.id,
        role="customer",
        is_admin=False,
        audience="customer",
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

    # Set cookies with SameSite=Strict, Secure=True, HttpOnly=True for refresh
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/api/v1/auth",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,
        secure=True,
        samesite="strict",
        path="/api/v1/auth",
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
            },
        },
        "request_id": request_id,
    }

@router.post("/refresh", status_code=200)
def refresh(request: Request, response: Response, db: SessionDep):
    request_id = get_request_id(request)
    ip = get_client_ip(request)

    if not check_rate_limit(f"rl:refresh:{ip}", limit=30, window_seconds=60):
        raise HTTPException(
            status_code=429,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": "Too many refresh attempts."},
        )

    # Double-submit CSRF protection
    csrf_header = request.headers.get("X-CSRF-Token")
    if not csrf_header:
        raise HTTPException(
            status_code=403,
            detail={"code": "CSRF_TOKEN_MISSING", "message": "X-CSRF-Token header is required for token refresh."},
        )

    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(
            status_code=401,
            detail={"code": "REFRESH_TOKEN_MISSING", "message": "No refresh token cookie provided."},
        )

    db_token = db.query(RefreshToken).filter(RefreshToken.token == token).first()
    if not db_token:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_REFRESH_TOKEN", "message": "Invalid refresh token."},
        )

    # REPLAY / THEFT DETECTION: If a revoked token is presented, revoke the entire token family
    if db_token.revoked:
        logger.warning(f"Revoked refresh token reuse detected for user {db_token.user_id}, family {db_token.family_id}!")
        db.query(RefreshToken).filter(RefreshToken.family_id == db_token.family_id).update({"revoked": True})
        db.commit()
        response.delete_cookie("refresh_token", path="/api/v1/auth")
        response.delete_cookie("csrf_token", path="/api/v1/auth")
        raise HTTPException(
            status_code=401,
            detail={"code": "TOKEN_REUSE_DETECTED", "message": "Token reuse detected. All sessions revoked."},
        )

    if is_expired(db_token.expires_at):
        raise HTTPException(
            status_code=401,
            detail={"code": "REFRESH_TOKEN_EXPIRED", "message": "Refresh token has expired."},
        )

    # Validate CSRF matches the stored session CSRF token
    if db_token.csrf_token != csrf_header:
        raise HTTPException(
            status_code=403,
            detail={"code": "CSRF_TOKEN_MISMATCH", "message": "Invalid CSRF token."},
        )

    # Token rotation: Invalidate current token and issue new token in the same family
    db_token.revoked = True
    new_refresh = create_refresh_token()
    new_csrf = create_csrf_token()
    new_expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    new_db_token = RefreshToken(
        user_id=db_token.user_id,
        token=new_refresh,
        family_id=db_token.family_id,
        csrf_token=new_csrf,
        expires_at=new_expire,
        revoked=False,
    )
    db.add(new_db_token)
    db.commit()

    access_token = create_access_token(
        subject=db_token.user_id,
        role="customer",
        is_admin=False,
        audience="customer",
    )

    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/api/v1/auth",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
    )
    response.set_cookie(
        key="csrf_token",
        value=new_csrf,
        httponly=False,
        secure=True,
        samesite="strict",
        path="/api/v1/auth",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
    )

    user = db_token.user
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
            },
        },
        "request_id": request_id,
    }

@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: SessionDep):
    token = request.cookies.get("refresh_token")
    if token:
        db_token = db.query(RefreshToken).filter(RefreshToken.token == token).first()
        if db_token:
            db_token.revoked = True
            db.commit()

    response.delete_cookie(key="refresh_token", path="/api/v1/auth")
    response.delete_cookie(key="csrf_token", path="/api/v1/auth")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/me", status_code=200)
def get_auth_me(current_user: CurrentUser, request: Request):
    request_id = get_request_id(request)
    return {
        "data": {
            "id": str(current_user.id),
            "email": current_user.email,
            "full_name": current_user.full_name,
            "status": current_user.status,
            "is_admin": current_user.is_superuser,
        },
        "request_id": request_id,
    }

@router.post("/forgot-password", status_code=202)
def forgot_password(data: ForgotPassword, request: Request, db: SessionDep):
    request_id = get_request_id(request)
    ip = get_client_ip(request)
    email_norm = data.email.lower()

    if not check_rate_limit(f"rl:forgot:email:{email_norm}", limit=3, window_seconds=3600) or \
       not check_rate_limit(f"rl:forgot:ip:{ip}", limit=10, window_seconds=3600):
        raise HTTPException(
            status_code=429,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": "Too many reset attempts. Please wait before retrying."},
        )

    user = db.query(User).filter(func.lower(User.email) == email_norm).first()
    if user:
        # Invalidate prior unused reset tokens
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used == False,
        ).update({"used": True})

        raw_token = create_opaque_token()
        token_hash = hash_token(raw_token)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)

        reset_token = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            used=False,
        )
        db.add(reset_token)
        db.commit()

        try:
            send_password_reset_email_task.delay(user.email, raw_token)
        except Exception as e:
            logger.warning(f"Failed to enqueue password reset email via Celery: {e}")

    # Always return 202 enumeration-safe
    return {
        "data": {"message": "If an account exists, a password reset email has been sent."},
        "request_id": request_id,
    }

@router.post("/reset-password", status_code=200)
def reset_password(data: ResetPassword, request: Request, db: SessionDep):
    request_id = get_request_id(request)
    ip = get_client_ip(request)

    if not check_rate_limit(f"rl:reset:{ip}", limit=10, window_seconds=3600):
        raise HTTPException(
            status_code=429,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": "Too many reset attempts."},
        )

    token_hash = hash_token(data.token)
    reset_token = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first()

    if not reset_token or is_expired(reset_token.expires_at):
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_OR_EXPIRED_TOKEN", "message": "Password reset token is invalid or has expired."},
        )

    if reset_token.used:
        raise HTTPException(
            status_code=400,
            detail={"code": "TOKEN_ALREADY_USED", "message": "Password reset token has already been used."},
        )

    user = reset_token.user
    if not user:
        raise HTTPException(status_code=400, detail={"code": "USER_NOT_FOUND", "message": "User not found."})

    user.hashed_password = get_password_hash(data.new_password)
    reset_token.used = True

    # Critical requirement: Revoke ALL existing refresh tokens for the account
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
    db.commit()

    return {"data": {"status": "password_reset"}, "request_id": request_id}
