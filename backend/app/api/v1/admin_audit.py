"""Admin Audit Log APIs.
Conforms to Document 01 §21 (AUDIT-001, AUDIT-002), Document 03 §46, Document 04 §49.
"""
import uuid
import math
from typing import Optional
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentAdmin
from app.models.user import User, AuditEvent

router = APIRouter()


@router.get("", summary="ADMIN-AUDIT-API-001: Immutable audit log viewer")
def list_audit_logs(
    request: Request,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Scoped: SUPER_ADMIN sees all; other staff see only logs where user_id == current_admin.id."""
    query = db.query(AuditEvent)
    is_su = getattr(admin, "is_superuser", False) or getattr(admin, "role", "") == "SUPER_ADMIN"
    if not is_su:
        query = query.filter(AuditEvent.user_id == admin.id)

    total = query.count()
    logs = (
        query.order_by(AuditEvent.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "data": [
            {
                "id": str(log.id),
                "actor_id": str(log.user_id) if log.user_id else None,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "details": log.details,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": max(1, math.ceil(total / page_size)),
        },
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }
