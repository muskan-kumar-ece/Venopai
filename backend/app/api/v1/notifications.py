from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.orm import Session
import math

from app.api.deps import get_db, CurrentUser
from app.core.exceptions import get_request_id
from app.schemas.notification import NotificationOut
from app.models.engagement import Notification

router = APIRouter()


@router.get("", summary="NOTIF-API-001: Notification send-history log (paginated)")
def get_my_notifications(
    current_user: CurrentUser,
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Return paginated notification send-history for the authenticated customer.
    This is a SEND-HISTORY LOG ONLY. There is no inbox, unread count, or mark-as-read in V1.
    IDOR protected — only the authenticated customer's own notifications are returned."""
    offset = (page - 1) * page_size
    total = db.query(Notification).filter(Notification.user_id == current_user.id).count()
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )
    return {
        "data": [NotificationOut.model_validate(n) for n in notifications],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": max(1, math.ceil(total / page_size)),
        },
        "request_id": get_request_id(request),
    }
