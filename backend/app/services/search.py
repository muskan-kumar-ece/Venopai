from typing import List, Optional, Tuple
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, case

from app.models.catalog import Product, Category, Inventory
from app.services.catalog import _paise

def search_products(
    db: Session,
    query: str,
    category_id: Optional[uuid.UUID] = None,
    min_price: Optional[str] = None,
    max_price: Optional[str] = None,
    availability: Optional[str] = None,
    sort: str = "relevance",
    page: int = 1,
    page_size: int = 24,
) -> Tuple[List[Product], int, List[dict]]:
    """SRCH-001: Keyword search over active products across name, description, and specifications.
    SRCH-002: If total == 0, returns category suggestions.
    """
    clean_q = query.strip()
    pattern = f"%{clean_q}%"

    q = db.query(Product).filter(Product.status == "active")

    # Filter over name, description, specifications
    q = q.filter(
        or_(
            Product.name.ilike(pattern),
            Product.description.ilike(pattern),
            Product.specifications.ilike(pattern),
        )
    )

    # Category filter (M:N)
    if category_id:
        q = q.filter(Product.categories.any(Category.id == category_id))

    # Price range filters
    if min_price is not None:
        q = q.filter(Product.price_paise >= _paise(min_price))
    if max_price is not None:
        q = q.filter(Product.price_paise <= _paise(max_price))

    # Availability filter
    if availability in ("in_stock", "out_of_stock"):
        q = q.outerjoin(Inventory, Product.id == Inventory.product_id)
        if availability == "in_stock":
            q = q.filter((Inventory.stock_quantity - Inventory.reserved_quantity) > 0)
        else:
            q = q.filter(
                (Inventory.id.is_(None)) |
                ((Inventory.stock_quantity - Inventory.reserved_quantity) <= 0)
            )

    # Sorting
    if sort == "price_asc":
        q = q.order_by(Product.price_paise.asc())
    elif sort == "price_desc":
        q = q.order_by(Product.price_paise.desc())
    elif sort == "newest":
        q = q.order_by(Product.created_at.desc())
    else:
        # Default 'relevance': exact name match first, starts-with name next, then created_at desc
        exact_match = case((Product.name.ilike(clean_q), 1), else_=0)
        starts_match = case((Product.name.ilike(f"{clean_q}%"), 1), else_=0)
        q = q.order_by(exact_match.desc(), starts_match.desc(), Product.created_at.desc())

    total = q.count()
    products = q.offset((page - 1) * page_size).limit(page_size).all()

    suggested_categories: List[dict] = []
    if total == 0:
        # SRCH-002: no-result search presents category suggestions
        # Suggest categories matching the term or top active categories
        cats = (
            db.query(Category)
            .filter(Category.is_active == True)
            .filter(Category.name.ilike(pattern))
            .limit(5)
            .all()
        )
        if not cats:
            cats = (
                db.query(Category)
                .filter(Category.is_active == True)
                .order_by(Category.position, Category.name)
                .limit(5)
                .all()
            )
        suggested_categories = [
            {"id": str(c.id), "name": c.name, "slug": c.slug}
            for c in cats
        ]

    return products, total, suggested_categories


def autocomplete(db: Session, query: str) -> List[str]:
    """SEARCH-API-002: Autocomplete suggestions capped at 8 items."""
    clean_q = query.strip()
    if len(clean_q) < 2:
        return []

    pattern = f"%{clean_q}%"
    starts_pattern = f"{clean_q}%"

    exact_or_starts = case((Product.name.ilike(starts_pattern), 1), else_=0)

    rows = (
        db.query(Product.name)
        .filter(Product.status == "active")
        .filter(Product.name.ilike(pattern))
        .order_by(exact_or_starts.desc(), Product.name.asc())
        .limit(8)
        .all()
    )
    return [r[0] for r in rows]
