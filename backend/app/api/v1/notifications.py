from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentUser
from app.core.exceptions import get_request_id
from app.schemas.notification import NotificationOut
from app.models.engagement import Notification

router = APIRouter()

@router.get("")
def get_my_notifications(current_user: CurrentUser, request: Request, db: Session = Depends(get_db)):
    notifications = db.query(Notification).filter(Notification.user_id == current_user.id).order_by(Notification.created_at.desc()).all()
    return {
        "data": [NotificationOut.model_validate(n) for n in notifications],
        "request_id": get_request_id(request)
    }
