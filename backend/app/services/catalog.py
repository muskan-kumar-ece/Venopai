import json
import uuid
from typing import Optional, List, Tuple
from decimal import Decimal
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.catalog import Category, Product, Inventory, InventoryReservation, ProductCategory
from app.models.user import AuditEvent
from app.integrations.cloudinary import cloudinary_provider
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

def _build_product_fields(data: dict) -> Tuple[dict, Optional[List[uuid.UUID]]]:
    out = {}
    category_ids = None

    if "category_ids" in data:
        raw_ids = data["category_ids"] or []
        cat_uuids = []
        for cid in raw_ids:
            if isinstance(cid, str):
                cat_uuids.append(uuid.UUID(cid))
            else:
                cat_uuids.append(cid)
        category_ids = cat_uuids

    for k, v in data.items():
        if k == "category_ids" or k == "category_id":
            continue
        elif k == "price":
            out["price_paise"] = _paise(v)
        elif k == "compare_price":
            out["compare_price_paise"] = _paise(v)
        elif k == "cost_price":
            out["cost_price_paise"] = _paise(v)
        elif k in ("images", "specifications", "variant_attributes") and v is not None:
            out[k] = json.dumps(v) if isinstance(v, (list, dict)) else v
        else:
            out[k] = v
    return out, category_ids

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
    """CAT-001: only 'active' products returned to public callers.
    Supports M:N category filtering via ProductCategory junction.
    """
    q = db.query(Product)
    if not admin:
        q = q.filter(Product.status == "active")
    if category_id:
        q = q.filter(Product.categories.any(Category.id == category_id))
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
    """Admin: create a product in 'draft' status (CAT-001 - not public until activated).
    Supports multiple categories (Document 01 CAT-010, Document 02 §10).
    """
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

    fields, category_ids = _build_product_fields(data)

    # Validate categories exist
    matched_categories = []
    if category_ids:
        # Check for duplicates in request
        if len(category_ids) != len(set(category_ids)):
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="DUPLICATE_CATEGORY_ASSIGNMENT",
                message="Duplicate category assignment requested",
            )
        matched_categories = db.query(Category).filter(Category.id.in_(category_ids)).all()
        if len(matched_categories) != len(category_ids):
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="CATEGORY_NOT_FOUND",
                message="One or more specified categories do not exist",
            )

    fields.setdefault("status", "draft")

    product = Product(**fields)
    if matched_categories:
        product.categories = matched_categories
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
        details=json.dumps({
            "name": product.name,
            "sku": product.sku,
            "status": product.status,
            "category_ids": [str(c.id) for c in matched_categories],
        }),
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

    fields, category_ids = _build_product_fields(data)
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

    if category_ids is not None:
        if len(category_ids) != len(set(category_ids)):
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="DUPLICATE_CATEGORY_ASSIGNMENT",
                message="Duplicate category assignment requested",
            )
        matched_categories = db.query(Category).filter(Category.id.in_(category_ids)).all()
        if len(matched_categories) != len(category_ids):
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="CATEGORY_NOT_FOUND",
                message="One or more specified categories do not exist",
            )
        product.categories = matched_categories

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
# Image upload service (ADMIN-CAT-API-004)
# ---------------------------------------------------------------------------

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10MB

def add_product_image(
    db: Session,
    product_id: uuid.UUID,
    file_bytes: bytes,
    filename: str,
    admin_user,
    content_type: Optional[str] = None,
) -> dict:
    """ADMIN-CAT-API-004: Upload public product image through Cloudinary provider.
    Validates product, checks image validity, updates product.images list,
    and logs AuditEvent.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="PRODUCT_NOT_FOUND",
            message="Product not found",
        )

    if not file_bytes or len(file_bytes) == 0:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_IMAGE",
            message="Image file cannot be empty",
        )

    if len(file_bytes) > MAX_IMAGE_BYTES:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_IMAGE",
            message="Image file exceeds maximum permitted size (10MB)",
        )

    # Validate image extension / content type
    import os
    ext = os.path.splitext(filename)[1].lower() if filename else ""
    if ext not in ALLOWED_IMAGE_EXTENSIONS and (content_type and content_type not in ALLOWED_IMAGE_MIMES):
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_IMAGE",
            message=f"Unsupported image type. Allowed extensions: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}",
        )

    # Upload via Cloudinary provider abstraction
    try:
        upload_result = cloudinary_provider.upload(
            file_bytes=file_bytes,
            filename=filename or "product_image.jpg",
            folder="products",
            access="public",
        )
        image_url = upload_result.get("url")
        if not image_url:
            raise RuntimeError("Cloudinary did not return a valid image URL")
    except Exception as e:
        raise APIException(
            status_code=http_status.HTTP_502_BAD_GATEWAY,
            code="IMAGE_UPLOAD_FAILED",
            message=f"Cloudinary upload failed: {str(e)}",
        )

    # Update product.images list preserving ordering
    existing_images = _parse_json_list(product.images)
    existing_images.append(image_url)
    product.images = json.dumps(existing_images)

    # Audit
    audit = AuditEvent(
        user_id=admin_user.id,
        action="UPLOAD_PRODUCT_IMAGE",
        entity_type="Product",
        entity_id=product.id,
        details=json.dumps({
            "image_url": image_url,
            "filename": filename,
            "total_images": len(existing_images),
        }),
    )
    db.add(audit)
    db.commit()
    db.refresh(product)

    return {
        "product_id": str(product.id),
        "image_url": image_url,
        "images": existing_images,
        "primary_image_url": existing_images[0] if existing_images else None,
    }

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
    variants = _parse_json_list(product.variant_attributes)
    category_ids = [str(c.id) for c in (product.categories or [])]

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
        "variant_attributes": variants,
        "category_ids": category_ids,
        "is_featured": product.is_featured,
        "weight_grams": product.weight_grams,
        "created_at": product.created_at.isoformat() if product.created_at else None,
    }

def build_admin_product_dict(product: Product) -> dict:
    inv = product.inventory
    images = _parse_json_list(product.images)
    specs = _parse_json_list(product.specifications)
    variants = _parse_json_list(product.variant_attributes)
    category_ids = [str(c.id) for c in (product.categories or [])]

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
        "variant_attributes": variants,
        "category_ids": category_ids,
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
