from typing import Optional
from fastapi import APIRouter, Request, Depends, Query
from sqlalchemy.orm import Session
import uuid
import math

from app.api.deps import get_db
from app.services import catalog as catalog_service
from app.core.exceptions import APIException
from fastapi import status as http_status

router = APIRouter()

def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")

# ---------------------------------------------------------------------------
# CAT-API-001 — GET /api/v1/products
# ---------------------------------------------------------------------------

@router.get("/products")
def list_products(
    request: Request,
    db: Session = Depends(get_db),
    category: Optional[str] = Query(None),
    min_price: Optional[str] = Query(None),
    max_price: Optional[str] = Query(None),
    availability: Optional[str] = Query(None),
    sort: str = Query("newest"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
):
    """CAT-API-001: list active products with pagination, filters, sorting."""
    valid_sorts = {"relevance", "price_asc", "price_desc", "newest"}
    if sort not in valid_sorts:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_SORT",
            message=f"sort must be one of {valid_sorts}",
        )
    valid_avail = {"in_stock", "out_of_stock", None}
    if availability not in valid_avail:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_AVAILABILITY",
            message="availability must be 'in_stock' or 'out_of_stock'",
        )
    cat_uuid = None
    if category:
        try:
            cat_uuid = uuid.UUID(category)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="INVALID_CATEGORY_ID",
                message="category must be a valid UUID",
            )

    products, total = catalog_service.list_products(
        db,
        category_id=cat_uuid,
        min_price=min_price,
        max_price=max_price,
        availability=availability,
        sort=sort,
        page=page,
        page_size=page_size,
        admin=False,
    )
    total_pages = max(1, math.ceil(total / page_size))
    return {
        "data": [catalog_service.build_public_product_dict(p) for p in products],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": total_pages,
        },
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# CAT-API-002 — GET /api/v1/products/{product_id}
# ---------------------------------------------------------------------------

@router.get("/products/{product_id}")
def get_product(product_id: str, request: Request, db: Session = Depends(get_db)):
    """CAT-API-002: product detail. 404 for inactive/draft."""
    try:
        pid = uuid.UUID(product_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="PRODUCT_NOT_FOUND",
            message="Product not found",
        )
    product = catalog_service.get_product(db, pid, admin=False)
    if not product:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="PRODUCT_NOT_FOUND",
            message="Product not found",
        )
    return {
        "data": catalog_service.build_public_product_dict(product),
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# CAT-API-003 — GET /api/v1/categories
# ---------------------------------------------------------------------------

@router.get("/categories")
def list_categories(request: Request, db: Session = Depends(get_db)):
    """CAT-API-003: list active categories (two-level tree)."""
    categories = catalog_service.list_categories(db, include_inactive=False)
    return {
        "data": [catalog_service.build_category_dict(c) for c in categories],
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# CAT-API-004 — GET /api/v1/categories/{category_id}
# ---------------------------------------------------------------------------

@router.get("/categories/{category_id}")
def get_category(
    category_id: str,
    request: Request,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
):
    """CAT-API-004: category detail with its products paginated."""
    try:
        cid = uuid.UUID(category_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="CATEGORY_NOT_FOUND",
            message="Category not found",
        )
    cat = catalog_service.get_category(db, cid, include_inactive=False)
    if not cat:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="CATEGORY_NOT_FOUND",
            message="Category not found",
        )
    products, total = catalog_service.list_products(
        db,
        category_id=cid,
        page=page,
        page_size=page_size,
        admin=False,
    )
    return {
        "data": {
            "category": catalog_service.build_category_dict(cat),
            "products": [catalog_service.build_public_product_dict(p) for p in products],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": total,
                "total_pages": max(1, math.ceil(total / page_size)),
            },
        },
        "request_id": _request_id(request),
    }
