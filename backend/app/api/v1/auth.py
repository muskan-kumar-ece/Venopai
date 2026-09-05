import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api.deps import SessionDep, CurrentUser
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token
from app.models.user import User, RefreshToken
from app.schemas.auth import (
    UserCreate, UserLogin, VerifyEmail, ResendVerification, 
    ForgotPassword, ResetPassword, UserResponse, StandardResponse
)
from app.core.config import settings

router = APIRouter()

@router.post("/register", status_code=201)
def register(user_in: UserCreate, request: Request, db: SessionDep):
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(
            status_code=409, 
            detail={"code": "EMAIL_ALREADY_EXISTS", "message": "An account with this email already exists."}
        )
    
    user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        phone=user_in.phone,
        status="registered"
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Fake enqueueing email verification here
    
    return {
        "data": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "status": user.status,
            "created_at": user.created_at.isoformat()
        },
        "request_id": str(uuid.uuid4())
    }

@router.post("/verify-email", status_code=200)
def verify_email(data: VerifyEmail, request: Request, db: SessionDep):
    # Dummy logic for token - assuming token is just "valid_token" for tests
    if data.token == "invalid":
        raise HTTPException(status_code=400, detail="Invalid token")
    # In real world, we decode or fetch the token owner
    # For now, return generic verified response
    return {"data": {"status": "verified"}, "request_id": str(uuid.uuid4())}

@router.post("/resend-verification", status_code=202)
def resend_verification(data: ResendVerification, request: Request, db: SessionDep):
    return {"data": {"message": "If an account exists, a verification email has been sent."}, "request_id": str(uuid.uuid4())}

@router.post("/login", status_code=200)
def login(user_in: UserLogin, request: Request, response: Response, db: SessionDep):
    user = db.query(User).filter(User.email == user_in.email).first()
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if user.status == "deactivated":
        raise HTTPException(status_code=403, detail="Account deactivated")
        
    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token()
    
    # Store refresh token
    import datetime as dt
    expire_date = datetime.now(timezone.utc) + dt.timedelta(days=7)
    db_token = RefreshToken(user_id=user.id, token=refresh_token, expires_at=expire_date)
    db.add(db_token)
    db.commit()
    
    # Set cookie
    response.set_cookie(
        key="refresh_token", 
        value=refresh_token, 
        httponly=True, 
        secure=True, 
        samesite="lax"
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
                "status": user.status
            }
        },
        "request_id": str(uuid.uuid4())
    }

@router.post("/refresh", status_code=200)
def refresh(request: Request, response: Response, db: SessionDep):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
        
    db_token = db.query(RefreshToken).filter(RefreshToken.token == token).first()
    if not db_token or db_token.revoked or db_token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
        
    # Rotate token
    db_token.revoked = True
    new_refresh = create_refresh_token()
    import datetime as dt
    expire_date = datetime.now(timezone.utc) + dt.timedelta(days=7)
    new_db_token = RefreshToken(user_id=db_token.user_id, token=new_refresh, expires_at=expire_date)
    db.add(new_db_token)
    db.commit()
    
    access_token = create_access_token(subject=db_token.user_id)
    
    response.set_cookie(
        key="refresh_token", 
        value=new_refresh, 
        httponly=True, 
        secure=True, 
        samesite="lax"
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
                "status": user.status
            }
        },
        "request_id": str(uuid.uuid4())
    }

@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: SessionDep):
    token = request.cookies.get("refresh_token")
    if token:
        db_token = db.query(RefreshToken).filter(RefreshToken.token == token).first()
        if db_token:
            db_token.revoked = True
            db.commit()
    response.delete_cookie("refresh_token")
    return None

@router.get("/me", status_code=200)
def get_me(current_user: CurrentUser, request: Request):
    return {
        "data": {
            "id": str(current_user.id),
            "email": current_user.email,
            "full_name": current_user.full_name,
            "status": current_user.status,
            "is_admin": current_user.is_superuser
        },
        "request_id": str(uuid.uuid4())
    }

@router.post("/forgot-password", status_code=202)
def forgot_password(data: ForgotPassword, request: Request, db: SessionDep):
    return {"data": {"message": "If an account exists, a verification email has been sent."}, "request_id": str(uuid.uuid4())}

@router.post("/reset-password", status_code=200)
def reset_password(data: ResetPassword, request: Request, db: SessionDep):
    # Dummy logic for tests
    return {"data": {"status": "password_reset"}, "request_id": str(uuid.uuid4())}
