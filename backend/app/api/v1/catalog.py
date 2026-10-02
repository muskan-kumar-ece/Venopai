from typing import Optional
from fastapi import APIRouter, Request, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
import uuid
import math

from app.api.deps import get_db
from app.models.catalog import Category
from app.services import catalog as catalog_service
from app.core.exceptions import APIException
from app.core.cache import cache_get, cache_set
from app.core.rate_limit import RateLimiter
from fastapi import status as http_status

router = APIRouter()

def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")

# ---------------------------------------------------------------------------
# CAT-API-001 — GET /api/v1/products
# ---------------------------------------------------------------------------

@router.get("/catalog/products", dependencies=[Depends(RateLimiter(limit=120, window_seconds=60, key_prefix="rl:catalog_list", scope="ip"))])
@router.get("/products", dependencies=[Depends(RateLimiter(limit=120, window_seconds=60, key_prefix="rl:catalog_list", scope="ip"))])
def list_products(
    request: Request,
    db: Session = Depends(get_db),
    category: Optional[str] = Query(None),
    category_slug: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    min_price: Optional[str] = Query(None),
    max_price: Optional[str] = Query(None),
    availability: Optional[str] = Query(None),
    sort: str = Query("newest"),
    page: int = Query(1, ge=1),
    page_size: int = Query(36, ge=1, le=100),
):
    """CAT-API-001: list active products with pagination, filters, sorting, and search."""
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

    cat_query_val = category or category_slug
    cat_uuid = None
    if cat_query_val:
        try:
            cat_uuid = uuid.UUID(cat_query_val)
        except ValueError:
            cat_obj = (
                db.query(Category)
                .filter(
                    func.lower(Category.slug) == cat_query_val.lower(),
                    Category.is_active == True,
                )
                .first()
            )
            if not cat_obj:
                cat_obj = (
                    db.query(Category)
                    .filter(
                        func.lower(Category.name) == cat_query_val.lower(),
                        Category.is_active == True,
                    )
                    .first()
                )
            if cat_obj:
                cat_uuid = cat_obj.id
            else:
                # Category does not exist: return empty list cleanly instead of crashing
                return {
                    "data": [],
                    "pagination": {
                        "page": page,
                        "page_size": page_size,
                        "total_items": 0,
                        "total_pages": 1,
                        "has_next": False,
                        "has_prev": False,
                    },
                    "request_id": _request_id(request),
                }

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
        search=search,
    )
    total_pages = max(1, math.ceil(total / page_size))
    return {
        "data": [catalog_service.build_public_product_dict(p) for p in products],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1,
        },
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# CAT-API-002 — GET /api/v1/products/{product_id}
# ---------------------------------------------------------------------------

@router.get("/products/{product_id}")
def get_product(product_id: str, request: Request, db: Session = Depends(get_db)):
    """CAT-API-002: product detail. 404 for inactive/draft."""
    product = catalog_service.get_product_by_id_or_slug(db, product_id, admin=False)
    if not product:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="PRODUCT_NOT_FOUND",
            message="Product not found",
        )

    cache_key = f"cache:prod:detail:{product.id}"
    cached_prod = cache_get(cache_key)
    if cached_prod is not None:
        return {
            "data": cached_prod,
            "request_id": _request_id(request),
        }

    prod_data = catalog_service.build_public_product_dict(product)
    cache_set(cache_key, prod_data, ttl_seconds=600)
    return {
        "data": prod_data,
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# CAT-API-003 — GET /api/v1/categories
# ---------------------------------------------------------------------------

@router.get("/catalog/categories")
@router.get("/categories")
def list_categories(request: Request, db: Session = Depends(get_db)):
    """CAT-API-003: list active categories (two-level tree)."""
    cache_key = "cache:cat:tree"
    cached_tree = cache_get(cache_key)
    if cached_tree is not None:
        return {
            "data": cached_tree,
            "request_id": _request_id(request),
        }

    categories = catalog_service.list_categories(db, include_inactive=False)
    tree_data = [catalog_service.build_category_dict(c) for c in categories]
    cache_set(cache_key, tree_data, ttl_seconds=3600)
    return {
        "data": tree_data,
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
    page_size: int = Query(36, ge=1, le=100),
):
    """CAT-API-004: category detail with its products paginated."""
    cat = None
    cid = None
    try:
        cid = uuid.UUID(category_id)
        cat = catalog_service.get_category(db, cid, include_inactive=False)
    except ValueError:
        cat = (
            db.query(Category)
            .filter(
                func.lower(Category.slug) == category_id.lower(),
                Category.is_active == True,
            )
            .first()
        )
        if not cat:
            cat = (
                db.query(Category)
                .filter(
                    func.lower(Category.name) == category_id.lower(),
                    Category.is_active == True,
                )
                .first()
            )
        if cat:
            cid = cat.id

    if not cat or not cid:
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
    total_pages = max(1, math.ceil(total / page_size))
    return {
        "data": {
            "category": catalog_service.build_category_dict(cat),
            "products": [catalog_service.build_public_product_dict(p) for p in products],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": total,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1,
            },
        },
        "request_id": _request_id(request),
    }


# ---------------------------------------------------------------------------
# REVIEW-API-005 — GET /api/v1/products/{product_id}/reviews
# Public reviews for a product — only visible (non-moderated) reviews.
# Returns average_rating and review_count summary.
# ---------------------------------------------------------------------------

@router.get(
    "/products/{product_id}/reviews",
    status_code=200,
    summary="REVIEW-API-005: Public reviews for a product",
)
def get_product_reviews(
    product_id: str,
    request: Request,
    db: Session = Depends(get_db),
    limit: Optional[int] = Query(None, ge=1, le=100),
):
    """Return only visible (non-moderated) reviews for a product, plus average_rating and review_count."""
    from app.models.engagement import Review
    from sqlalchemy import func as sqlfunc

    product = catalog_service.get_product_by_id_or_slug(db, product_id, admin=False)
    if product:
        pid = product.id
    else:
        try:
            pid = uuid.UUID(product_id)
        except ValueError:
            raise APIException(http_status.HTTP_422_UNPROCESSABLE_ENTITY, "INVALID_UUID", "Invalid product_id")

    query = (
        db.query(Review)
        .filter(Review.product_id == pid, Review.is_visible == True)
        .order_by(Review.created_at.desc())
    )

    total_reviews = query.count()
    if limit is not None:
        reviews = query.limit(limit).all()
    else:
        reviews = query.all()

    avg = (
        db.query(sqlfunc.avg(Review.rating))
        .filter(Review.product_id == pid, Review.is_visible == True)
        .scalar()
    )

    return {
        "data": [
            {
                "id": str(r.id),
                "user_id": str(r.user_id),
                "target_type": r.target_type,
                "target_id": str(r.target_id),
                "product_id": str(r.product_id) if r.product_id else None,
                "rating": r.rating,
                "text": r.comment,
                "comment": r.comment,
                "is_visible": r.is_visible,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reviews
        ],
        "average_rating": round(float(avg), 2) if avg else None,
        "review_count": total_reviews,
        "request_id": _request_id(request),
    }
