import uuid
from typing import Generator, Annotated, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import jwt
from pydantic import ValidationError

from app.db.session import SessionLocal
from app.core.config import settings
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)

def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(oauth2_scheme)]
OptionalTokenDep = Annotated[Optional[str], Depends(oauth2_scheme_optional)]

def get_current_user(db: SessionDep, token: TokenDep) -> User:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_aud": False},
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "UNAUTHORIZED", "message": "Could not validate credentials"},
            )
    except (jwt.PyJWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Could not validate credentials"},
        )
        
    try:
        user_uuid = uuid.UUID(str(user_id))
    except Exception:
        user_uuid = user_id
    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_NOT_FOUND", "message": "User account no longer exists"},
        )
    if user.status == "deactivated":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_DEACTIVATED", "message": "Account has been deactivated"},
        )
    return user

def get_optional_current_user(db: SessionDep, token: OptionalTokenDep) -> Optional[User]:
    if not token:
        return None
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_aud": False},
        )
        user_id = payload.get("sub")
        if not user_id:
            return None
        try:
            user_uuid = uuid.UUID(str(user_id))
        except Exception:
            user_uuid = user_id
        user = db.query(User).filter(User.id == user_uuid).first()
        if user and user.status != "deactivated":
            return user
    except Exception:
        return None
    return None

def get_current_admin(db: SessionDep, token: TokenDep) -> User:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_aud": False},
        )
        user_id: str = payload.get("sub")
        is_admin: bool = payload.get("is_admin", False)
        aud: str = payload.get("aud", "")
        
        if not user_id or not is_admin or aud != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "FORBIDDEN", "message": "Admin privileges required"},
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_EXPIRED", "message": "Admin session has expired. Please sign in again."},
        )
    except (jwt.PyJWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Could not validate credentials"},
        )
        
    try:
        user_uuid = uuid.UUID(str(user_id))
    except Exception:
        user_uuid = user_id
    user = db.query(User).filter(User.id == user_uuid).first()
    ADMIN_ROLES = {
        "SUPER_ADMIN",
        "ADMIN",
        "ORDER_MANAGER",
        "MANUFACTURING_MANAGER",
        "SUPPORT_EXECUTIVE",
        "FINANCE_MANAGER",
    }
    if not user or (not user.is_superuser and user.role not in ADMIN_ROLES):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Admin privileges required"},
        )
    if user.status == "deactivated":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_DEACTIVATED", "message": "Account has been deactivated"},
        )
    return user

CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalCurrentUser = Annotated[Optional[User], Depends(get_optional_current_user)]
CurrentAdmin = Annotated[User, Depends(get_current_admin)]

CANONICAL_ADMIN_ROLES = [
    "SUPER_ADMIN",
    "ADMIN",
    "ORDER_MANAGER",
    "MANUFACTURING_MANAGER",
    "SUPPORT_EXECUTIVE",
    "FINANCE_MANAGER",
]

def require_admin_roles(*allowed_roles: str):
    """Dependency that checks if current admin has one of the allowed roles or is SUPER_ADMIN/superuser."""
    def role_checker(current_admin: CurrentAdmin) -> User:
        if current_admin.is_superuser or current_admin.role == "SUPER_ADMIN":
            return current_admin
        if current_admin.role in allowed_roles:
            return current_admin
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "INSUFFICIENT_PERMISSIONS",
                "message": f"Action requires one of the following roles: {', '.join(allowed_roles)}",
            },
        )
    return role_checker

RequireSuperAdmin = Annotated[User, Depends(require_admin_roles("SUPER_ADMIN"))]
