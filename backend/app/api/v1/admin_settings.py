"""Admin Platform & System Settings APIs.
Conforms to Document 01 §21 (AUDIT-001, AUDIT-002), Document 02 §19, Document 03 §46, Document 04 §49.
"""
import json
import uuid
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Request, HTTPException, status as http_status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentAdmin
from app.core.config import settings
from app.models.user import AuditEvent

router = APIRouter()

# In-memory fallback if Redis is not configured or fails
_MEMORY_SETTINGS: Dict[str, Any] = {
    "gst_rate": str(float(getattr(settings, "DEFAULT_GST_RATE_PERCENT", 18))),
    "quote_validity_days": "7",
    "free_shipping_threshold": "50000",
    "maintenance_mode": False,
    "require_email_verification": True,
    "notification_retries": "3",
}

REDIS_SETTINGS_KEY = "venopai:system_settings"


def _get_redis_client():
    try:
        import redis
        client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=2)
        client.ping()
        return client
    except Exception:
        return None


def _load_settings() -> Dict[str, Any]:
    redis_client = _get_redis_client()
    if redis_client:
        try:
            cached = redis_client.get(REDIS_SETTINGS_KEY)
            if cached:
                data = json.loads(cached)
                merged = dict(_MEMORY_SETTINGS)
                merged.update(data)
                return merged
        except Exception:
            pass
    return dict(_MEMORY_SETTINGS)


def _save_settings(data: Dict[str, Any]) -> None:
    global _MEMORY_SETTINGS
    _MEMORY_SETTINGS.update(data)
    redis_client = _get_redis_client()
    if redis_client:
        try:
            redis_client.set(REDIS_SETTINGS_KEY, json.dumps(_MEMORY_SETTINGS))
        except Exception:
            pass


def _get_integration_statuses() -> Dict[str, bool]:
    return {
        "razorpay": bool(settings.RAZORPAY_KEY_ID),
        "shiprocket": bool(settings.SHIPROCKET_EMAIL),
        "resend": bool(settings.RESEND_API_KEY),
        "cloudinary": bool(settings.CLOUDINARY_CLOUD_NAME),
        "sentry": bool(settings.SENTRY_DSN),
    }


def _verify_superadmin(admin) -> None:
    is_su = getattr(admin, "is_superuser", False) or getattr(admin, "role", "") == "SUPER_ADMIN"
    if not is_su:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Platform settings require SUPER_ADMIN privileges."},
        )


class AdminSettingsUpdateRequest(BaseModel):
    gst_rate: Optional[str] = None
    quote_validity_days: Optional[str] = None
    free_shipping_threshold: Optional[str] = None
    maintenance_mode: Optional[bool] = None
    require_email_verification: Optional[bool] = None
    notification_retries: Optional[str] = None


@router.get("", summary="ADMIN-SETTINGS-API-001: Get system and integration settings")
def get_admin_settings(
    request: Request,
    admin: CurrentAdmin,
):
    _verify_superadmin(admin)
    current_settings = _load_settings()
    current_settings["integrations"] = _get_integration_statuses()
    
    return {
        "data": current_settings,
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }


@router.put("", summary="ADMIN-SETTINGS-API-002: Update system and commercial policies")
def update_admin_settings(
    payload: AdminSettingsUpdateRequest,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    _verify_superadmin(admin)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail={"code": "EMPTY_PAYLOAD", "message": "No settings provided to update."},
        )

    _save_settings(updates)

    # Immutable Audit Log Entry
    try:
        audit = AuditEvent(
            user_id=admin.id,
            action="UPDATE_SETTINGS",
            entity_type="system_settings",
            entity_id=None,
            details=json.dumps({"updated_fields": updates}),
        )
        db.add(audit)
        db.commit()
    except Exception:
        db.rollback()

    updated_settings = _load_settings()
    updated_settings["integrations"] = _get_integration_statuses()

    return {
        "data": updated_settings,
        "message": "Settings successfully updated.",
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }
