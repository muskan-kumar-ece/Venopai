"""Admin Customer Management APIs.
Conforms to Document 01 §20, Document 02 §21, Document 04 §39.
"""
import uuid
import math
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, Query, HTTPException, status as http_status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_db, CurrentAdmin
from app.models.user import User, Address, AuditEvent
from app.models.order import Order
from app.models.project import ManufacturingRequest, DesignRequest, SoftwareRequest, ConsultationRequest, Project
from app.core.exceptions import APIException

router = APIRouter()


def _verify_customer_role(admin: User, deactivation: bool = False):
    """Doc 04 §39: Scoped to SUPPORT_EXECUTIVE, SUPER_ADMIN. Deactivation is SUPER_ADMIN only."""
    role = getattr(admin, "role", "")
    is_su = getattr(admin, "is_superuser", False) or role == "SUPER_ADMIN"
    if deactivation:
        if not is_su:
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="SUPER_ADMIN_REQUIRED",
                message="Account deactivation is restricted to SUPER_ADMIN",
            )
    else:
        if not is_su and role not in ("SUPPORT_EXECUTIVE", "ORDER_MANAGER"):
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="INSUFFICIENT_ROLE",
                message="Customer management requires SUPPORT_EXECUTIVE or SUPER_ADMIN",
            )


class DeactivateCustomerRequest(BaseModel):
    reason: Optional[str] = None


@router.get("", summary="ADMIN-CUST-API-001: List/search customers")
def admin_list_customers(
    request: Request,
    admin: CurrentAdmin,
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    segment: Optional[str] = Query(None, description="Filter: engineering or retail"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    _verify_customer_role(admin)
    query = db.query(User).filter(User.role == "customer")
    if status:
        query = query.filter(User.status == status)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter((User.email.ilike(s)) | (User.full_name.ilike(s)) | (User.phone.ilike(s)))

    if segment == "engineering":
        query = query.filter(
            (User.id.in_(db.query(ManufacturingRequest.user_id))) |
            (User.id.in_(db.query(DesignRequest.user_id))) |
            (User.id.in_(db.query(SoftwareRequest.user_id))) |
            (User.id.in_(db.query(ConsultationRequest.user_id)))
        )
    elif segment == "retail":
        query = query.filter(User.id.in_(db.query(Order.user_id)))

    total = query.count()
    customers = (
        query.order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    c_ids = [c.id for c in customers]
    orders_counts = dict(
        db.query(Order.user_id, func.count(Order.id))
        .filter(Order.user_id.in_(c_ids))
        .group_by(Order.user_id)
        .all()
    ) if c_ids else {}

    mfg_counts = dict(
        db.query(ManufacturingRequest.user_id, func.count(ManufacturingRequest.id))
        .filter(ManufacturingRequest.user_id.in_(c_ids))
        .group_by(ManufacturingRequest.user_id)
        .all()
    ) if c_ids else {}

    design_counts = dict(
        db.query(DesignRequest.user_id, func.count(DesignRequest.id))
        .filter(DesignRequest.user_id.in_(c_ids))
        .group_by(DesignRequest.user_id)
        .all()
    ) if c_ids else {}

    sw_counts = dict(
        db.query(SoftwareRequest.user_id, func.count(SoftwareRequest.id))
        .filter(SoftwareRequest.user_id.in_(c_ids))
        .group_by(SoftwareRequest.user_id)
        .all()
    ) if c_ids else {}

    data = [
        {
            "id": str(c.id),
            "email": c.email,
            "full_name": c.full_name,
            "phone": c.phone,
            "status": c.status,
            "is_active": c.is_active,
            "orders_count": orders_counts.get(c.id, 0),
            "requests_count": mfg_counts.get(c.id, 0) + design_counts.get(c.id, 0) + sw_counts.get(c.id, 0),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in customers
    ]

    return {
        "data": data,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": max(1, math.ceil(total / page_size)),
        },
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }


@router.get("/{customer_id}", summary="ADMIN-CUST-API-002: Customer detail")
def admin_get_customer(
    customer_id: str,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    _verify_customer_role(admin)
    try:
        c_uuid = uuid.UUID(customer_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Customer not found")

    customer = db.query(User).filter(User.id == c_uuid).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    orders_count = db.query(Order).filter(Order.user_id == customer.id).count()
    addresses = db.query(Address).filter(Address.user_id == customer.id).all()

    return {
        "data": {
            "id": str(customer.id),
            "email": customer.email,
            "full_name": customer.full_name,
            "phone": customer.phone,
            "status": customer.status,
            "is_active": customer.is_active,
            "orders_count": orders_count,
            "addresses": [
                {
                    "id": str(a.id),
                    "city": a.city,
                    "state": a.state,
                    "pincode": a.pincode,
                    "is_default": a.is_default,
                }
                for a in addresses
            ],
            "created_at": customer.created_at.isoformat() if customer.created_at else None,
        },
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }


@router.get("/{customer_id}/orders", summary="ADMIN-CUST-API-003: Customer orders")
def admin_get_customer_orders(
    customer_id: str,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    _verify_customer_role(admin)
    try:
        c_uuid = uuid.UUID(customer_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Customer not found")

    orders = db.query(Order).filter(Order.user_id == c_uuid).order_by(Order.created_at.desc()).all()
    return {
        "data": [
            {
                "id": str(o.id),
                "order_number": o.order_number,
                "status": o.status,
                "total_amount_paise": o.total_amount_paise,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
            for o in orders
        ],
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }


@router.get("/{customer_id}/requests", summary="ADMIN-CUST-API-004: Customer service requests")
def admin_get_customer_requests(
    customer_id: str,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    _verify_customer_role(admin)
    try:
        c_uuid = uuid.UUID(customer_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Customer not found")

    mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.user_id == c_uuid).all()
    design = db.query(DesignRequest).filter(DesignRequest.user_id == c_uuid).all()
    sw = db.query(SoftwareRequest).filter(SoftwareRequest.user_id == c_uuid).all()
    consult = db.query(ConsultationRequest).filter(ConsultationRequest.user_id == c_uuid).all()

    requests_data = []
    for r in mfg:
        requests_data.append({"id": str(r.id), "type": "manufacturing", "title": r.title or "Manufacturing Request", "status": r.status})
    for r in design:
        requests_data.append({"id": str(r.id), "type": "design", "title": r.title or "PCB Design Request", "status": r.status})
    for r in sw:
        requests_data.append({"id": str(r.id), "type": "software", "title": r.title or "Firmware/Software Request", "status": r.status})
    for r in consult:
        requests_data.append({"id": str(r.id), "type": "consultation", "title": r.topic or "Consultation", "status": r.status})

    return {
        "data": requests_data,
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }


@router.get("/{customer_id}/projects", summary="ADMIN-CUST-API-005: Customer projects")
def admin_get_customer_projects(
    customer_id: str,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    _verify_customer_role(admin)
    try:
        c_uuid = uuid.UUID(customer_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Customer not found")

    projects = db.query(Project).filter(Project.user_id == c_uuid).all()
    return {
        "data": [
            {
                "id": str(p.id),
                "name": p.name,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in projects
        ],
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }


@router.post("/{customer_id}/deactivate", summary="ADMIN-CUST-API-006: Deactivate an account")
def admin_deactivate_customer(
    customer_id: str,
    body: DeactivateCustomerRequest,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    _verify_customer_role(admin, deactivation=True)
    try:
        c_uuid = uuid.UUID(customer_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Customer not found")

    customer = db.query(User).filter(User.id == c_uuid).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    customer.status = "deactivated"
    customer.is_active = False

    audit = AuditEvent(
        user_id=admin.id,
        action="DEACTIVATE_CUSTOMER",
        resource_type="user",
        resource_id=str(customer.id),
        details={"reason": body.reason},
    )
    db.add(audit)
    db.commit()

    return {
        "status": "customer_deactivated",
        "customer_id": str(customer.id),
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }
