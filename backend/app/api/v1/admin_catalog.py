from typing import Optional
from fastapi import APIRouter, Request, Depends, Query
from sqlalchemy.orm import Session
import uuid
import math

from app.api.deps import get_db, CurrentAdmin
from app.services import catalog as catalog_service
from app.core.exceptions import APIException
from fastapi import status as http_status

router = APIRouter()

def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")

# ---------------------------------------------------------------------------
# ADMIN-CAT-API-001 — GET /api/v1/admin/products
# ---------------------------------------------------------------------------

@router.get("/admin/products")
def admin_list_products(
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
    category: Optional[str] = Query(None),
    min_price: Optional[str] = Query(None),
    max_price: Optional[str] = Query(None),
    availability: Optional[str] = Query(None),
    sort: str = Query("newest"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
):
    """ADMIN-CAT-API-001: list including inactive/draft products."""
    cat_uuid = None
    if category:
        try:
            cat_uuid = uuid.UUID(category)
        except ValueError:
            pass
    products, total = catalog_service.list_products(
        db,
        category_id=cat_uuid,
        min_price=min_price,
        max_price=max_price,
        availability=availability,
        sort=sort,
        page=page,
        page_size=page_size,
        admin=True,
    )
    total_pages = max(1, math.ceil(total / page_size))
    return {
        "data": [catalog_service.build_admin_product_dict(p) for p in products],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": total_pages,
        },
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# ADMIN-CAT-API-002 — POST /api/v1/admin/products
# ---------------------------------------------------------------------------

@router.post("/admin/products", status_code=201)
def admin_create_product(
    request: Request,
    body: dict,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """ADMIN-CAT-API-002: create a product (starts in 'draft')."""
    product = catalog_service.create_product(db, body, admin)
    return {
        "data": catalog_service.build_admin_product_dict(product),
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# ADMIN-CAT-API-003 — PATCH /api/v1/admin/products/{id}
# ---------------------------------------------------------------------------

@router.patch("/admin/products/{product_id}")
def admin_update_product(
    product_id: str,
    request: Request,
    body: dict,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """ADMIN-CAT-API-003: update product including status transitions."""
    try:
        pid = uuid.UUID(product_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="PRODUCT_NOT_FOUND",
            message="Product not found",
        )
    product = catalog_service.update_product(db, pid, body, admin)
    return {
        "data": catalog_service.build_admin_product_dict(product),
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# ADMIN-CAT-API-005 — GET /api/v1/admin/categories
# ---------------------------------------------------------------------------

@router.get("/admin/categories")
def admin_list_categories(
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """ADMIN-CAT-API-005: list all categories including hidden."""
    categories = catalog_service.list_categories(db, include_inactive=True)
    return {
        "data": [catalog_service.build_category_dict(c) for c in categories],
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# ADMIN-CAT-API-006 — POST /api/v1/admin/categories
# ---------------------------------------------------------------------------

@router.post("/admin/categories", status_code=201)
def admin_create_category(
    request: Request,
    body: dict,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """ADMIN-CAT-API-006: create category (max 2-level nesting)."""
    category = catalog_service.create_category(db, body, admin)
    return {
        "data": catalog_service.build_category_dict(category),
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# ADMIN-CAT-API-007 — PATCH /api/v1/admin/categories/{id}
# ---------------------------------------------------------------------------

@router.patch("/admin/categories/{category_id}")
def admin_update_category(
    category_id: str,
    request: Request,
    body: dict,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """ADMIN-CAT-API-007: edit/hide a category."""
    try:
        cid = uuid.UUID(category_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="CATEGORY_NOT_FOUND",
            message="Category not found",
        )
    category = catalog_service.update_category(db, cid, body, admin)
    return {
        "data": catalog_service.build_category_dict(category),
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# ADMIN-INV-API-001 — GET /api/v1/admin/inventory
# ---------------------------------------------------------------------------

@router.get("/admin/inventory")
def admin_list_inventory(
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """ADMIN-INV-API-001: list inventory across all products."""
    from app.models.catalog import Inventory
    q = db.query(Inventory)
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    data = [
        {
            "product_id": str(i.product_id),
            "stock_quantity": i.stock_quantity,
            "reserved_quantity": i.reserved_quantity,
            "available_quantity": i.stock_quantity - i.reserved_quantity,
            "reorder_point": i.reorder_point,
        }
        for i in items
    ]
    return {
        "data": data,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": max(1, math.ceil(total / page_size)),
        },
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# ADMIN-INV-API-002 — GET /api/v1/admin/inventory/{product_id}
# ---------------------------------------------------------------------------

@router.get("/admin/inventory/{product_id}")
def admin_get_inventory(
    product_id: str,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """ADMIN-INV-API-002: single product's inventory detail."""
    try:
        pid = uuid.UUID(product_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="INVENTORY_NOT_FOUND",
            message="Inventory record not found",
        )
    from app.models.catalog import Inventory
    inv = db.query(Inventory).filter(Inventory.product_id == pid).first()
    if not inv:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="INVENTORY_NOT_FOUND",
            message="Inventory record not found for this product",
        )
    return {
        "data": {
            "product_id": str(inv.product_id),
            "stock_quantity": inv.stock_quantity,
            "reserved_quantity": inv.reserved_quantity,
            "available_quantity": inv.stock_quantity - inv.reserved_quantity,
            "reorder_point": inv.reorder_point,
            "version": inv.version,
        },
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# ADMIN-INV-API-003 — POST /api/v1/admin/inventory/{product_id}/adjust
# ---------------------------------------------------------------------------

@router.post("/admin/inventory/{product_id}/adjust")
def admin_adjust_inventory(
    product_id: str,
    request: Request,
    body: dict,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """ADMIN-INV-API-003: manual stock adjustment. reason is required (AUDIT-001)."""
    try:
        pid = uuid.UUID(product_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="INVENTORY_NOT_FOUND",
            message="Inventory record not found",
        )
    delta = body.get("delta")
    reason = body.get("reason", "").strip()
    if delta is None:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="MISSING_DELTA",
            message="'delta' is required",
        )
    if not reason:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="MISSING_REASON",
            message="'reason' is required for inventory adjustments",
        )
    inv = catalog_service.adjust_inventory(db, pid, delta, reason, admin)
    return {
        "data": {
            "product_id": str(inv.product_id),
            "stock_quantity": inv.stock_quantity,
            "reserved_quantity": inv.reserved_quantity,
            "available_quantity": inv.stock_quantity - inv.reserved_quantity,
            "adjusted_by": delta,
            "reason": reason,
        },
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# ADMIN-INV-API-004 — GET /api/v1/admin/inventory/{product_id}/reservations
# ---------------------------------------------------------------------------

@router.get("/admin/inventory/{product_id}/reservations")
def admin_list_reservations(
    product_id: str,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """ADMIN-INV-API-004: list active reservations for troubleshooting."""
    try:
        pid = uuid.UUID(product_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="INVENTORY_NOT_FOUND",
            message="Inventory record not found",
        )
    reservations = catalog_service.list_reservations(db, pid)
    return {
        "data": [
            {
                "id": str(r.id),
                "inventory_id": str(r.inventory_id),
                "order_id": str(r.order_id) if r.order_id else None,
                "quantity": r.quantity,
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            }
            for r in reservations
        ],
        "request_id": _request_id(request),
    }
