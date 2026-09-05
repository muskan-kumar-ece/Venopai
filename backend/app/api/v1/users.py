import uuid
from fastapi import APIRouter, Request
from app.api.deps import CurrentUser

router = APIRouter()

@router.get("/me", status_code=200)
def get_user_profile(current_user: CurrentUser, request: Request):
    return {
        "data": {
            "id": str(current_user.id),
            "email": current_user.email,
            "full_name": current_user.full_name,
            "status": current_user.status,
            "phone": current_user.phone,
            "is_admin": current_user.is_superuser
        },
        "request_id": str(uuid.uuid4())
    }
