from typing import Optional
from fastapi import APIRouter, Request, Depends, Query
from sqlalchemy.orm import Session
import uuid
import math
from fastapi import status as http_status

from app.api.deps import get_db
from app.services import search as search_service
from app.services import catalog as catalog_service
from app.core.exceptions import APIException
from app.schemas.search import SearchProductsResponse, AutocompleteResponse

router = APIRouter()

def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")

# ---------------------------------------------------------------------------
# SEARCH-API-001 — GET /api/v1/search/products
# ---------------------------------------------------------------------------

@router.get("/products", response_model=SearchProductsResponse)
def search_products_endpoint(
    request: Request,
    db: Session = Depends(get_db),
    q: Optional[str] = Query(None, description="Search term"),
    category: Optional[str] = Query(None, description="Category UUID filter"),
    min_price: Optional[str] = Query(None, description="Minimum price filter"),
    max_price: Optional[str] = Query(None, description="Maximum price filter"),
    availability: Optional[str] = Query(None, description="Availability: in_stock or out_of_stock"),
    sort: str = Query("relevance", description="Sort by relevance, price_asc, price_desc, newest"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
):
    """SEARCH-API-001: Keyword search over the catalog (SRCH-001, SRCH-002)."""
    if not q or not q.strip():
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="MISSING_SEARCH_QUERY",
            message="Query parameter 'q' is required",
        )

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

    products, total, suggested_categories = search_service.search_products(
        db,
        query=q,
        category_id=cat_uuid,
        min_price=min_price,
        max_price=max_price,
        availability=availability,
        sort=sort,
        page=page,
        page_size=page_size,
    )

    total_pages = max(1, math.ceil(total / page_size))
    return {
        "query": q,
        "data": [catalog_service.build_public_product_dict(p) for p in products],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": total_pages,
        },
        "suggested_categories": suggested_categories if total == 0 else None,
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# SEARCH-API-002 — GET /api/v1/search/autocomplete
# ---------------------------------------------------------------------------

@router.get("/autocomplete", response_model=AutocompleteResponse)
def autocomplete_endpoint(
    request: Request,
    db: Session = Depends(get_db),
    q: Optional[str] = Query(None, description="Search prefix / term"),
):
    """SEARCH-API-002: Fast lightweight autocomplete suggestion list, capped at 8 results."""
    if not q or len(q.strip()) < 2:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_AUTOCOMPLETE_QUERY",
            message="Query parameter 'q' must be at least 2 characters",
        )

    suggestions = search_service.autocomplete(db, query=q)
    return {
        "data": {
            "suggestions": suggestions,
        },
        "request_id": _request_id(request),
    }
