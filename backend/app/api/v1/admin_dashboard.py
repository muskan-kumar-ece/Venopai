import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, Request, status as http_status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.deps import get_db, CurrentAdmin
from app.models.user import User
from app.models.project import (
    ManufacturingRequest,
    DesignRequest,
    SoftwareRequest,
    ConsultationRequest,
    Quote,
)
from app.models.order import Order, Payment, Refund, Shipment
from app.models.catalog import Product, Inventory
from app.models.engagement import Review
from app.core.cache import cache_get, cache_set

router = APIRouter()



def _get_admin_role_string(admin: User) -> str:
    if getattr(admin, "is_superuser", False) or getattr(admin, "role", "") == "SUPER_ADMIN":
        return "SUPER_ADMIN"
    return getattr(admin, "role", "") or "SUPER_ADMIN"


@router.get(
    "",
    status_code=http_status.HTTP_200_OK,
    summary="ADMIN-DASH-API-001: Role-scoped Admin Dashboard queues and metrics",
)
def get_admin_dashboard(
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """
    ADMIN-DASH-API-001 — GET /api/v1/admin/dashboard
    Powers the role-scoped Admin Dashboard with coherent queues and headline metrics.
    Filtered server-side according to the admin user's role:
    - MANUFACTURING_MANAGER: manufacturing/design/software queues, quotes awaiting response
    - ORDER_MANAGER: new orders, shipping exceptions, low stock alerts
    - FINANCE_MANAGER: pending payments, pending refunds, revenue metrics
    - SUPPORT_EXECUTIVE: flagged reviews, customer inquiries
    - SUPER_ADMIN: comprehensive union of all queues and metrics
    """
    role = _get_admin_role_string(admin)
    fresh = request.query_params.get("fresh") == "true"
    cache_key = f"cache:admin:dash:{role}"
    if not fresh:
        cached_dash = cache_get(cache_key)
        if cached_dash is not None:
            return {
                "data": cached_dash,
                "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
            }

    is_super = role in ("SUPER_ADMIN", "ADMIN")
    is_mfg = is_super or role == "MANUFACTURING_MANAGER"
    is_order = is_super or role == "ORDER_MANAGER"
    is_finance = is_super or role == "FINANCE_MANAGER"
    is_support = is_super or role == "SUPPORT_EXECUTIVE"

    now = datetime.now(timezone.utc)
    three_days_ago = now - timedelta(days=3)

    queues: Dict[str, List[Dict[str, Any]]] = {}
    headline_metrics: Dict[str, Any] = {}


    # 1. MANUFACTURING / SERVICE QUEUES
    if is_mfg:
        # Awaiting review
        mfg_review = db.query(ManufacturingRequest).filter(
            ManufacturingRequest.status.in_(["submitted", "under_review"])
        ).limit(10).all()
        design_review = db.query(DesignRequest).filter(
            DesignRequest.status.in_(["submitted", "under_review"])
        ).limit(10).all()
        sw_review = db.query(SoftwareRequest).filter(
            SoftwareRequest.status.in_(["submitted", "under_review"])
        ).limit(10).all()

        awaiting_review = []
        for r in mfg_review:
            awaiting_review.append({
                "id": str(r.id),
                "type": "manufacturing",
                "title": r.title,
                "status": r.status,
                "submitted_at": r.created_at.isoformat() if r.created_at else None,
            })
        for r in design_review:
            awaiting_review.append({
                "id": str(r.id),
                "type": "design",
                "title": r.title,
                "status": r.status,
                "submitted_at": r.created_at.isoformat() if r.created_at else None,
            })
        for r in sw_review:
            awaiting_review.append({
                "id": str(r.id),
                "type": "software",
                "title": r.title,
                "status": r.status,
                "submitted_at": r.created_at.isoformat() if r.created_at else None,
            })
        queues["new_requests_awaiting_review"] = awaiting_review

        # In clarification
        mfg_clar = db.query(ManufacturingRequest).filter(
            ManufacturingRequest.status == "clarification_requested"
        ).limit(10).all()
        design_clar = db.query(DesignRequest).filter(
            DesignRequest.status == "clarification_requested"
        ).limit(10).all()
        sw_clar = db.query(SoftwareRequest).filter(
            SoftwareRequest.status == "clarification_requested"
        ).limit(10).all()

        in_clarification = []
        for r in mfg_clar:
            in_clarification.append({"id": str(r.id), "type": "manufacturing", "title": r.title, "status": r.status})
        for r in design_clar:
            in_clarification.append({"id": str(r.id), "type": "design", "title": r.title, "status": r.status})
        for r in sw_clar:
            in_clarification.append({"id": str(r.id), "type": "software", "title": r.title, "status": r.status})
        queues["requests_in_clarification"] = in_clarification

        # Quotes awaiting customer response
        sent_quotes = db.query(Quote).filter(Quote.status == "sent").limit(10).all()
        quotes_queue = []
        for q in sent_quotes:
            latest_v = sorted(q.versions, key=lambda v: v.version, reverse=True)[0] if q.versions else None
            quotes_queue.append({
                "id": str(q.id),
                "quote_number": f"QUO-{str(q.id)[:8].upper()}",
                "total_amount_paise": latest_v.total_amount if latest_v else 0,
                "valid_until": latest_v.valid_until.isoformat() if (latest_v and latest_v.valid_until) else None,
            })
        queues["quotes_awaiting_customer_response"] = quotes_queue

        # Metrics for manufacturing
        open_mfg = db.query(func.count(ManufacturingRequest.id)).filter(
            ~ManufacturingRequest.status.in_(["completed", "cancelled"])
        ).scalar() or 0
        open_design = db.query(func.count(DesignRequest.id)).filter(
            ~DesignRequest.status.in_(["completed", "cancelled"])
        ).scalar() or 0
        open_sw = db.query(func.count(SoftwareRequest.id)).filter(
            ~SoftwareRequest.status.in_(["completed", "cancelled"])
        ).scalar() or 0
        open_consult = db.query(func.count(ConsultationRequest.id)).filter(
            ~ConsultationRequest.status.in_(["completed", "cancelled", "closed"])
        ).scalar() or 0

        old_mfg = db.query(func.count(ManufacturingRequest.id)).filter(
            ManufacturingRequest.status.in_(["submitted", "under_review"]),
            ManufacturingRequest.created_at <= three_days_ago,
        ).scalar() or 0

        headline_metrics["open_requests"] = open_mfg + open_design + open_sw + open_consult
        headline_metrics["requests_older_than_3_days"] = old_mfg

    # 2. ORDER / SHIPPING / INVENTORY QUEUES
    if is_order:
        new_orders = db.query(Order).filter(
            Order.status.in_(["paid", "processing"])
        ).order_by(Order.created_at.desc()).limit(10).all()
        orders_queue = []
        for o in new_orders:
            orders_queue.append({
                "id": str(o.id),
                "order_number": o.order_number,
                "status": o.status,
                "total_amount_paise": o.total_amount_paise,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            })
        queues["new_orders"] = orders_queue

        shipping_exceptions = db.query(Shipment).filter(
            Shipment.status.in_(["exception", "delayed", "rto", "returned"])
        ).limit(10).all()
        exceptions_queue = []
        for s in shipping_exceptions:
            exceptions_queue.append({
                "id": str(s.id),
                "order_id": str(s.order_id) if s.order_id else None,
                "tracking_number": s.tracking_number,
                "status": s.status,
            })
        queues["shipping_exceptions"] = exceptions_queue

        # Low stock alerts
        inv_items = db.query(Inventory).all()
        low_stock = []
        for inv in inv_items:
            stock = inv.stock_quantity or 0
            reserved = inv.reserved_quantity or 0
            avail = stock - reserved
            reorder = inv.reorder_point or 5
            if avail <= reorder:
                low_stock.append({
                    "product_id": str(inv.product_id),
                    "available_quantity": avail,
                    "reorder_point": reorder,
                })
        queues["low_stock_alerts"] = low_stock[:10]

        open_orders_count = db.query(func.count(Order.id)).filter(
            ~Order.status.in_(["delivered", "cancelled"])
        ).scalar() or 0
        headline_metrics["open_orders"] = open_orders_count
        headline_metrics["low_stock_count"] = len(low_stock)

    # 3. FINANCE QUEUES
    if is_finance:
        pending_payments = db.query(Payment).filter(
            Payment.status == "pending"
        ).order_by(Payment.created_at.desc()).limit(10).all()
        payments_queue = []
        for p in pending_payments:
            payments_queue.append({
                "id": str(p.id),
                "amount": p.amount,
                "currency": p.currency,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            })
        queues["pending_payment_verifications"] = payments_queue

        pending_refunds = db.query(Refund).filter(
            Refund.status == "pending"
        ).order_by(Refund.created_at.desc()).limit(10).all()
        refunds_queue = []
        for rf in pending_refunds:
            refunds_queue.append({
                "id": str(rf.id),
                "payment_id": str(rf.payment_id),
                "amount": rf.amount,
                "reason": rf.reason,
                "created_at": rf.created_at.isoformat() if rf.created_at else None,
            })
        queues["refunds_to_process"] = refunds_queue

        rev_paise = db.query(func.sum(Payment.amount)).filter(Payment.status == "successful").scalar() or 0
        headline_metrics["total_revenue_paise"] = rev_paise
        headline_metrics["total_revenue_inr"] = round(rev_paise / 100.0, 2)
        headline_metrics["pending_refunds_count"] = len(pending_refunds)

    # 4. SUPPORT QUEUES
    if is_support:
        flagged_reviews = db.query(Review).filter(
            Review.is_visible == False
        ).limit(10).all()
        reviews_queue = []
        for rev in flagged_reviews:
            reviews_queue.append({
                "id": str(rev.id),
                "rating": rev.rating,
                "comment": rev.comment[:50] if rev.comment else "",
                "created_at": rev.created_at.isoformat() if rev.created_at else None,
            })
        queues["flagged_reviews"] = reviews_queue

        headline_metrics["flagged_reviews_count"] = len(flagged_reviews)

    res_data = {
        "role": role,
        "queues": queues,
        "headline_metrics": headline_metrics,
    }
    cache_set(cache_key, res_data, ttl_seconds=120)
    return {
        "data": res_data,
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }

