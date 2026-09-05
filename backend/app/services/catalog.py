import json
import uuid
from typing import Optional, List, Tuple
from decimal import Decimal
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.catalog import Category, Product, Inventory, InventoryReservation
from app.models.user import AuditEvent
from app.core.exceptions import APIException
from fastapi import status as http_status

def _paise(price_str: Optional[str]) -> Optional[int]:
    """Convert rupee string '1499.00' to integer paise 149900."""
    if price_str is None:
        return None
    return round(Decimal(str(price_str)) * 100)

def _rupees(paise: Optional[int]) -> Optional[str]:
    """Convert integer paise to formatted rupee string '1499.00'."""
    if paise is None:
        return None
    return f"{paise / 100:.2f}"

def _parse_json_list(val: Optional[str]) -> list:
    if not val:
        return []
    try:
        res = json.loads(val)
        return res if isinstance(res, list) else []
    except Exception:
        return []

def _stock_status(inventory: Optional[Inventory]) -> str:
    if inventory is None:
        return "out_of_stock"
    available = inventory.stock_quantity - inventory.reserved_quantity
    return "in_stock" if available > 0 else "out_of_stock"

# ---------------------------------------------------------------------------
# Category service
# ---------------------------------------------------------------------------

def list_categories(db: Session, include_inactive: bool = False) -> List[Category]:
    """CAT-011: category with no active products is still visible unless hidden by admin."""
    q = db.query(Category).filter(Category.parent_id.is_(None))
    if not include_inactive:
        q = q.filter(Category.is_active == True)
    return q.order_by(Category.position, Category.name).all()

def get_category(db: Session, category_id: uuid.UUID, include_inactive: bool = False) -> Optional[Category]:
    q = db.query(Category).filter(Category.id == category_id)
    if not include_inactive:
        q = q.filter(Category.is_active == True)
    return q.first()

def create_category(db: Session, data: dict, admin_user) -> Category:
    """Admin: create a category. Max 2 levels enforced (CAT-010)."""
    parent_id = data.get("parent_id")
    if parent_id:
        if isinstance(parent_id, str):
            parent_id = uuid.UUID(parent_id)
            data["parent_id"] = parent_id
        parent = db.query(Category).filter(Category.id == parent_id).first()
        if not parent:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="CATEGORY_NOT_FOUND",
                message="Parent category not found",
            )
        if parent.parent_id is not None:
            raise APIException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                code="MAX_NESTING_EXCEEDED",
                message="Category hierarchy is limited to two levels (category -> subcategory)",
            )

    slug = data.get("slug")
    existing = db.query(Category).filter(Category.slug == slug).first()
    if existing:
        raise APIException(
            status_code=http_status.HTTP_409_CONFLICT,
            code="SLUG_ALREADY_EXISTS",
            message="A category with this slug already exists",
        )

    category = Category(**data)
    db.add(category)
    db.flush()

    audit = AuditEvent(
        user_id=admin_user.id,
        action="CREATE_CATEGORY",
        entity_type="Category",
        entity_id=category.id,
        details=json.dumps({"name": category.name, "slug": category.slug}),
    )
    db.add(audit)
    db.commit()
    db.refresh(category)
    return category

def update_category(db: Session, category_id: uuid.UUID, data: dict, admin_user) -> Category:
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="CATEGORY_NOT_FOUND",
            message="Category not found",
        )

    if "slug" in data and data["slug"] != category.slug:
        existing = db.query(Category).filter(Category.slug == data["slug"]).first()
        if existing:
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="SLUG_ALREADY_EXISTS",
                message="A category with this slug already exists",
            )

    if "parent_id" in data and data["parent_id"]:
        parent_id = data["parent_id"]
        if isinstance(parent_id, str):
            parent_id = uuid.UUID(parent_id)
            data["parent_id"] = parent_id
        if parent_id == category.id:
            raise APIException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                code="INVALID_PARENT",
                message="A category cannot be its own parent",
            )
        parent = db.query(Category).filter(Category.id == parent_id).first()
        if not parent:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="CATEGORY_NOT_FOUND",
                message="Parent category not found",
            )
        if parent.parent_id is not None:
            raise APIException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                code="MAX_NESTING_EXCEEDED",
                message="Category hierarchy is limited to two levels",
            )

    for key, val in data.items():
        setattr(category, key, val)

    audit = AuditEvent(
        user_id=admin_user.id,
        action="UPDATE_CATEGORY",
        entity_type="Category",
        entity_id=category.id,
        details=json.dumps({"updated_fields": list(data.keys())}),
    )
    db.add(audit)
    db.commit()
    db.refresh(category)
    return category

# ---------------------------------------------------------------------------
# Product service
# ---------------------------------------------------------------------------

def _build_product_fields(data: dict) -> dict:
    out = {}
    for k, v in data.items():
        if k == "price":
            out["price_paise"] = _paise(v)
        elif k == "compare_price":
            out["compare_price_paise"] = _paise(v)
        elif k == "cost_price":
            out["cost_price_paise"] = _paise(v)
        elif k in ("images", "specifications") and v is not None:
            out[k] = json.dumps(v) if isinstance(v, (list, dict)) else v
        elif k == "category_id" and isinstance(v, str):
            out[k] = uuid.UUID(v)
        else:
            out[k] = v
    return out

def list_products(
    db: Session,
    category_id: Optional[uuid.UUID] = None,
    min_price: Optional[str] = None,
    max_price: Optional[str] = None,
    availability: Optional[str] = None,
    sort: str = "newest",
    page: int = 1,
    page_size: int = 24,
    admin: bool = False,
) -> Tuple[List[Product], int]:
    """CAT-001: only 'active' products returned to public callers."""
    q = db.query(Product)
    if not admin:
        q = q.filter(Product.status == "active")
    if category_id:
        q = q.filter(Product.category_id == category_id)
    if min_price is not None:
        q = q.filter(Product.price_paise >= _paise(min_price))
    if max_price is not None:
        q = q.filter(Product.price_paise <= _paise(max_price))
    if availability in ("in_stock", "out_of_stock"):
        q = q.outerjoin(Inventory, Product.id == Inventory.product_id)
        if availability == "in_stock":
            q = q.filter((Inventory.stock_quantity - Inventory.reserved_quantity) > 0)
        else:
            q = q.filter(
                (Inventory.id.is_(None)) |
                ((Inventory.stock_quantity - Inventory.reserved_quantity) <= 0)
            )

    if sort == "price_asc":
        q = q.order_by(Product.price_paise.asc())
    elif sort == "price_desc":
        q = q.order_by(Product.price_paise.desc())
    else:  # newest / relevance
        q = q.order_by(Product.created_at.desc())

    total = q.count()
    products = q.offset((page - 1) * page_size).limit(page_size).all()
    return products, total

def get_product(db: Session, product_id: uuid.UUID, admin: bool = False) -> Optional[Product]:
    """CAT-001: inactive/draft products return None (404) to public callers."""
    q = db.query(Product).filter(Product.id == product_id)
    if not admin:
        q = q.filter(Product.status == "active")
    return q.first()

def create_product(db: Session, data: dict, admin_user) -> Product:
    """Admin: create a product in 'draft' status (CAT-001 - not public until activated)."""
    slug = data.get("slug")
    if slug and db.query(Product).filter(Product.slug == slug).first():
        raise APIException(
            status_code=http_status.HTTP_409_CONFLICT,
            code="SLUG_ALREADY_EXISTS",
            message="A product with this slug already exists",
        )
    sku = data.get("sku")
    if sku and db.query(Product).filter(Product.sku == sku).first():
        raise APIException(
            status_code=http_status.HTTP_409_CONFLICT,
            code="SKU_ALREADY_EXISTS",
            message="A product with this SKU already exists",
        )
    cat_id = data.get("category_id")
    if isinstance(cat_id, str):
        cat_id = uuid.UUID(cat_id)
        data["category_id"] = cat_id
    if not cat_id or not db.query(Category).filter(Category.id == cat_id).first():
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="CATEGORY_NOT_FOUND",
            message="Category not found",
        )

    fields = _build_product_fields(data)
    fields.setdefault("status", "draft")

    product = Product(**fields)
    db.add(product)
    db.flush()

    # INV-001: Every product has an inventory record
    inventory = Inventory(product_id=product.id, stock_quantity=0, reserved_quantity=0)
    db.add(inventory)
    db.flush()

    audit = AuditEvent(
        user_id=admin_user.id,
        action="CREATE_PRODUCT",
        entity_type="Product",
        entity_id=product.id,
        details=json.dumps({"name": product.name, "sku": product.sku, "status": product.status}),
    )
    db.add(audit)
    db.commit()
    db.refresh(product)
    return product

def update_product(db: Session, product_id: uuid.UUID, data: dict, admin_user) -> Product:
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="PRODUCT_NOT_FOUND",
            message="Product not found",
        )

    fields = _build_product_fields(data)
    if "slug" in fields and fields["slug"] != product.slug:
        if db.query(Product).filter(Product.slug == fields["slug"]).first():
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="SLUG_ALREADY_EXISTS",
                message="A product with this slug already exists",
            )
    if "sku" in fields and fields["sku"] and fields["sku"] != product.sku:
        if db.query(Product).filter(Product.sku == fields["sku"]).first():
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="SKU_ALREADY_EXISTS",
                message="A product with this SKU already exists",
            )
    if "category_id" in fields and fields["category_id"] != product.category_id:
        if not db.query(Category).filter(Category.id == fields["category_id"]).first():
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="CATEGORY_NOT_FOUND",
                message="Category not found",
            )

    for k, v in fields.items():
        setattr(product, k, v)

    audit = AuditEvent(
        user_id=admin_user.id,
        action="UPDATE_PRODUCT",
        entity_type="Product",
        entity_id=product.id,
        details=json.dumps({"updated_fields": list(data.keys())}),
    )
    db.add(audit)
    db.commit()
    db.refresh(product)
    return product

# ---------------------------------------------------------------------------
# Inventory service
# ---------------------------------------------------------------------------

def adjust_inventory(
    db: Session,
    product_id: uuid.UUID,
    delta: int,
    reason: str,
    admin_user,
) -> Inventory:
    """ADMIN-INV-API-003: manual stock adjustment. Reason written to AuditEvent.
    Never allows negative available inventory.
    """
    inv = db.query(Inventory).filter(Inventory.product_id == product_id).first()
    if not inv:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="INVENTORY_NOT_FOUND",
            message="Inventory record not found for this product",
        )
    new_stock = inv.stock_quantity + delta
    if new_stock < 0:
        raise APIException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="INSUFFICIENT_STOCK",
            message=f"Adjustment would result in negative stock (current: {inv.stock_quantity}, delta: {delta})",
        )
    available_after = new_stock - inv.reserved_quantity
    if available_after < 0:
        raise APIException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="NEGATIVE_AVAILABLE_STOCK",
            message=(
                f"Adjustment would make available stock negative "
                f"(reserved: {inv.reserved_quantity}, new stock: {new_stock})"
            ),
        )
    old_stock = inv.stock_quantity
    inv.stock_quantity = new_stock
    inv.version += 1

    audit = AuditEvent(
        user_id=admin_user.id,
        action="ADJUST_INVENTORY",
        entity_type="Inventory",
        entity_id=inv.id,
        details=json.dumps({
            "product_id": str(product_id),
            "delta": delta,
            "reason": reason,
            "stock_before": old_stock,
            "stock_after": new_stock,
        }),
    )
    db.add(audit)
    db.commit()
    db.refresh(inv)
    return inv

def list_reservations(db: Session, product_id: uuid.UUID) -> List[InventoryReservation]:
    inv = db.query(Inventory).filter(Inventory.product_id == product_id).first()
    if not inv:
        return []
    return (
        db.query(InventoryReservation)
        .filter(
            InventoryReservation.inventory_id == inv.id,
            InventoryReservation.status == "ACTIVE",
        )
        .all()
    )

# ---------------------------------------------------------------------------
# Dictionary serializing helpers
# ---------------------------------------------------------------------------

def build_public_product_dict(product: Product) -> dict:
    inv = product.inventory
    images = _parse_json_list(product.images)
    specs = _parse_json_list(product.specifications)
    return {
        "id": str(product.id),
        "name": product.name,
        "slug": product.slug,
        "description": product.description,
        "price": _rupees(product.price_paise),
        "compare_price": _rupees(product.compare_price_paise),
        "currency": "INR",
        "stock_status": _stock_status(inv),
        "primary_image_url": images[0] if images else None,
        "images": images,
        "specifications": specs,
        "category_id": str(product.category_id),
        "is_featured": product.is_featured,
        "weight_grams": product.weight_grams,
        "created_at": product.created_at.isoformat() if product.created_at else None,
    }

def build_admin_product_dict(product: Product) -> dict:
    inv = product.inventory
    images = _parse_json_list(product.images)
    specs = _parse_json_list(product.specifications)
    inv_data = None
    if inv:
        inv_data = {
            "product_id": str(product.id),
            "stock_quantity": inv.stock_quantity,
            "reserved_quantity": inv.reserved_quantity,
            "available_quantity": inv.stock_quantity - inv.reserved_quantity,
        }
    return {
        "id": str(product.id),
        "name": product.name,
        "slug": product.slug,
        "sku": product.sku,
        "description": product.description,
        "price": _rupees(product.price_paise),
        "compare_price": _rupees(product.compare_price_paise),
        "cost_price": _rupees(product.cost_price_paise),
        "currency": "INR",
        "status": product.status,
        "stock_status": _stock_status(inv),
        "is_featured": product.is_featured,
        "primary_image_url": images[0] if images else None,
        "images": images,
        "specifications": specs,
        "category_id": str(product.category_id),
        "weight_grams": product.weight_grams,
        "inventory": inv_data,
        "created_at": product.created_at.isoformat() if product.created_at else None,
        "updated_at": product.updated_at.isoformat() if product.updated_at else None,
    }

def build_category_dict(cat: Category, include_children: bool = True) -> dict:
    d = {
        "id": str(cat.id),
        "name": cat.name,
        "slug": cat.slug,
        "description": cat.description,
        "image_url": cat.image_url,
        "parent_id": str(cat.parent_id) if cat.parent_id else None,
        "is_active": cat.is_active,
        "position": cat.position,
        "created_at": cat.created_at.isoformat() if getattr(cat, "created_at", None) else None,
        "updated_at": cat.updated_at.isoformat() if getattr(cat, "updated_at", None) else None,
    }
    if include_children:
        d["children"] = [build_category_dict(c, include_children=True) for c in (cat.children or [])]
    return d
