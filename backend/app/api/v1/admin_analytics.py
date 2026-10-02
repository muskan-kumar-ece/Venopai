"""Admin Operational Analytics APIs.
Conforms to Document 01 §28, Document 02 §21, Document 03 §47, Document 04 §48.
"""
import uuid
from typing import Dict, Any
from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.deps import get_db, CurrentAdmin
from app.models.user import User
from app.models.catalog import Product, Inventory
from app.models.order import Order, Payment
from app.models.project import ManufacturingRequest, DesignRequest, SoftwareRequest, ConsultationRequest, Quote

router = APIRouter()


@router.get("", summary="ADMIN-ANALYTICS-API-001: Operational analytics summary")
@router.get("/overview", summary="ADMIN-ANALYTICS-API-001: Operational analytics summary overview alias")
def get_admin_analytics(
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """Headline metrics aggregated directly from PostgreSQL database."""
    total_customers = db.query(User).filter(User.role == "customer").count()
    total_products = db.query(Product).count()
    total_orders = db.query(Order).count()

    total_revenue_paise = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.status.in_(["successful", "captured"])
    ).scalar() or 0

    low_stock_count = db.query(Inventory).filter(
        (Inventory.stock_quantity - Inventory.reserved_quantity) <= Inventory.reorder_point
    ).count()

    mfg_active = db.query(ManufacturingRequest).filter(
        ManufacturingRequest.status.notin_(["completed", "cancelled"])
    ).count()
    design_active = db.query(DesignRequest).filter(
        DesignRequest.status.notin_(["completed", "cancelled"])
    ).count()
    sw_active = db.query(SoftwareRequest).filter(
        SoftwareRequest.status.notin_(["completed", "cancelled"])
    ).count()
    consult_active = db.query(ConsultationRequest).filter(
        ConsultationRequest.status.notin_(["completed", "cancelled"])
    ).count()

    total_quotes = db.query(Quote).count()
    approved_quotes = db.query(Quote).filter(Quote.status == "approved").count()
    quote_conv_rate = round((approved_quotes / total_quotes * 100), 1) if total_quotes > 0 else 0.0

    return {
        "data": {
            "total_revenue_paise": int(total_revenue_paise),
            "total_revenue_inr": round(total_revenue_paise / 100, 2),
            "total_orders": total_orders,
            "total_customers": total_customers,
            "total_products": total_products,
            "low_stock_sku_count": low_stock_count,
            "active_services": {
                "manufacturing": mfg_active,
                "pcb_design": design_active,
                "firmware_software": sw_active,
                "consultations": consult_active,
                "total": mfg_active + design_active + sw_active + consult_active,
            },
            "quote_conversion_rate_percent": quote_conv_rate,
        },
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
    }


@router.get("/export", summary="ADMIN-ANALYTICS-API-002: Export analytics CSV")
def export_admin_analytics(
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    orders = db.query(Order).order_by(Order.created_at.desc()).limit(1000).all()
    csv_lines = ["Order Number,User ID,Status,Total (INR),Created At"]
    for o in orders:
        inr = round((getattr(o, "total_paise", 0) or 0) / 100, 2)
        csv_lines.append(f"{o.order_number},{o.user_id},{o.status},{inr},{o.created_at}")

    return PlainTextResponse(content="\n".join(csv_lines), media_type="text/csv")
