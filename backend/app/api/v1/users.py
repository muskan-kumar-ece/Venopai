from fastapi import APIRouter, Request, Depends
from app.api.deps import CurrentUser, get_db
from app.core.exceptions import get_request_id
from app.schemas.user import UserUpdateProfile, UserEmailChange, UserPasswordChange
from app.services import user as user_service
from sqlalchemy.orm import Session

router = APIRouter()

@router.get("/me", status_code=200)
def get_user_profile(current_user: CurrentUser, request: Request):
    request_id = get_request_id(request)
    return {
        "data": {
            "id": str(current_user.id),
            "email": current_user.email,
            "full_name": current_user.full_name,
            "status": current_user.status,
            "phone": current_user.phone,
            "is_admin": current_user.is_superuser,
        },
        "request_id": request_id,
    }

@router.patch("/me", status_code=200)
def update_profile(current_user: CurrentUser, request: Request, data: UserUpdateProfile, db: Session = Depends(get_db)):
    updated_user = user_service.update_user_profile(db, current_user, data)
    return {
        "data": {
            "id": str(updated_user.id),
            "email": updated_user.email,
            "full_name": updated_user.full_name,
            "status": updated_user.status,
            "phone": updated_user.phone,
            "is_admin": updated_user.is_superuser,
        },
        "request_id": get_request_id(request),
    }

@router.post("/me/email-change", status_code=200)
def change_email(current_user: CurrentUser, request: Request, data: UserEmailChange, db: Session = Depends(get_db)):
    updated_user = user_service.change_user_email(db, current_user, data)
    return {
        "data": {
            "id": str(updated_user.id),
            "email": updated_user.email,
            "full_name": updated_user.full_name,
            "status": updated_user.status,
            "phone": updated_user.phone,
            "is_admin": updated_user.is_superuser,
        },
        "request_id": get_request_id(request),
    }

@router.post("/me/password-change", status_code=200)
def change_password(current_user: CurrentUser, request: Request, data: UserPasswordChange, db: Session = Depends(get_db)):
    user_service.change_user_password(db, current_user, data)
    return {
        "message": "Password updated successfully",
        "request_id": get_request_id(request),
    }
