from typing import Optional
from fastapi import APIRouter, Request, Depends, Query, UploadFile, File
from sqlalchemy.orm import Session
import uuid
import math
import json

from app.api.deps import get_db, CurrentAdmin
from app.services import catalog as catalog_service
from app.models.user import User, AuditEvent
from app.models.catalog import Product
from app.integrations.cloudinary import cloudinary_provider
from app.core.exceptions import APIException
from app.core.cache import cache_delete, cache_delete_pattern
from fastapi import status as http_status

router = APIRouter()

def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")

def _verify_catalog_role(admin: User):
    """Document 04 §40: Scoped to ORDER_MANAGER, SUPER_ADMIN."""
    role = getattr(admin, "role", None)
    if role in ("SUPER_ADMIN", "ORDER_MANAGER"):
        return
    if not role and getattr(admin, "is_superuser", False):
        return
    raise APIException(
        status_code=http_status.HTTP_403_FORBIDDEN,
        code="INSUFFICIENT_ROLE",
        message="Catalog administration requires ORDER_MANAGER or SUPER_ADMIN role",
    )

# ---------------------------------------------------------------------------
# ADMIN-CAT-API-001 — GET /api/v1/admin/products
# ---------------------------------------------------------------------------

@router.get("/admin/catalog/products")
@router.get("/admin/products")
def admin_list_products(
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    min_price: Optional[str] = Query(None),
    max_price: Optional[str] = Query(None),
    availability: Optional[str] = Query(None),
    sort: str = Query("newest"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    """ADMIN-CAT-API-001: list including inactive/draft products with search & status filters."""
    _verify_catalog_role(admin)
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
        search=search,
        status=status,
    )
    total_pages = max(1, math.ceil(total / page_size))
    return {
        "data": [catalog_service.build_admin_product_dict(p) for p in products],
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
    _verify_catalog_role(admin)
    product = catalog_service.create_product(db, body, admin)
    cache_delete_pattern("cache:prod:*")
    cache_delete_pattern("cache:search:ac:*")
    return {
        "data": catalog_service.build_admin_product_dict(product),
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# ADMIN-CAT-API-DETAIL — GET /api/v1/admin/products/{id}
# ---------------------------------------------------------------------------

@router.get("/admin/products/{product_id}")
def admin_get_product(
    product_id: str,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """ADMIN-CAT-API-DETAIL: Fetch single product details for admin."""
    _verify_catalog_role(admin)
    try:
        pid = uuid.UUID(product_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="PRODUCT_NOT_FOUND",
            message="Product not found",
        )
    product = db.query(Product).filter(Product.id == pid).first()
    if not product:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="PRODUCT_NOT_FOUND",
            message="Product not found",
        )
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
    _verify_catalog_role(admin)
    try:
        pid = uuid.UUID(product_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="PRODUCT_NOT_FOUND",
            message="Product not found",
        )
    product = catalog_service.update_product(db, pid, body, admin)
    cache_delete(f"cache:prod:detail:{pid}")
    cache_delete_pattern("cache:search:ac:*")
    return {
        "data": catalog_service.build_admin_product_dict(product),
        "request_id": _request_id(request),
    }


# ---------------------------------------------------------------------------
# ADMIN-CAT-API-004 — POST /api/v1/admin/products/{id}/images
# ---------------------------------------------------------------------------

@router.post("/admin/products/{product_id}/images", status_code=201)
async def admin_upload_product_image(
    product_id: str,
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
    file: Optional[UploadFile] = File(None),
):
    """ADMIN-CAT-API-004: Upload a public media image (Cloudinary public path, Document 02 §16)."""
    _verify_catalog_role(admin)
    try:
        pid = uuid.UUID(product_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="PRODUCT_NOT_FOUND",
            message="Product not found",
        )

    file_bytes = None
    filename = "image.jpg"
    content_type = None

    if file is not None:
        filename = file.filename or "image.jpg"
        content_type = file.content_type
        file_bytes = await file.read()
    else:
        # Check if sent via JSON payload
        try:
            body = await request.json()
            if isinstance(body, dict) and "image_url" in body:
                image_url = body["image_url"]
                if not image_url or not isinstance(image_url, str):
                    raise APIException(
                        status_code=http_status.HTTP_400_BAD_REQUEST,
                        code="INVALID_IMAGE",
                        message="Valid image_url is required",
                    )
                import urllib.parse
                parsed = urllib.parse.urlparse(image_url)
                if parsed.scheme != "https" or not parsed.netloc:
                    raise APIException(
                        status_code=http_status.HTTP_400_BAD_REQUEST,
                        code="INVALID_IMAGE",
                        message="Valid HTTPS image URL is required",
                    )
                if parsed.netloc.lower() in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
                    raise APIException(
                        status_code=http_status.HTTP_400_BAD_REQUEST,
                        code="INVALID_IMAGE",
                        message="Internal or localhost image URLs are not permitted",
                    )
                product = db.query(Product).filter(Product.id == pid).first()
                if not product:
                    raise APIException(
                        status_code=http_status.HTTP_404_NOT_FOUND,
                        code="PRODUCT_NOT_FOUND",
                        message="Product not found",
                    )
                existing = catalog_service._parse_json_list(product.images)
                existing.append(image_url)
                product.images = json.dumps(existing)

                db.add(AuditEvent(
                    user_id=admin.id,
                    action="UPLOAD_PRODUCT_IMAGE",
                    entity_type="Product",
                    entity_id=product.id,
                    details=json.dumps({"image_url": image_url, "filename": "url_reference"}),
                ))
                db.commit()
                db.refresh(product)
                return {
                    "data": {
                        "product_id": str(product.id),
                        "image_url": image_url,
                        "images": existing,
                        "primary_image_url": existing[0],
                    },
                    "request_id": _request_id(request),
                }
        except APIException:
            raise
        except Exception:
            pass

    if not file_bytes:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_IMAGE",
            message="Image file is required",
        )

    result = catalog_service.add_product_image(
        db,
        product_id=pid,
        file_bytes=file_bytes,
        filename=filename,
        admin_user=admin,
        content_type=content_type,
    )
    return {
        "data": result,
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# ADMIN-CAT-API-MEDIA — POST /api/v1/admin/catalog/upload-media
# ---------------------------------------------------------------------------

ALLOWED_CATALOG_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_CATALOG_VIDEO_EXTS = {".mp4", ".webm", ".mov", ".mkv"}
ALLOWED_CATALOG_DOC_EXTS = {".pdf"}
MAX_CATALOG_IMAGE_BYTES = 15 * 1024 * 1024  # 15MB
MAX_CATALOG_VIDEO_BYTES = 100 * 1024 * 1024  # 100MB
MAX_CATALOG_DOC_BYTES = 25 * 1024 * 1024  # 25MB

@router.post("/admin/catalog/upload-media", status_code=201)
@router.post("/admin/products/upload-media", status_code=201)
async def admin_upload_catalog_media(
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    """Upload product images, videos, or PDF user manuals/datasheets for catalog management.
    Enables pre-uploading assets when creating new products or managing existing ones.
    """
    _verify_catalog_role(admin)

    filename = file.filename or "media_asset"
    content_type = file.content_type or ""

    import os
    ext = os.path.splitext(filename)[1].lower()

    is_image = ext in ALLOWED_CATALOG_IMAGE_EXTS or content_type.startswith("image/")
    is_video = ext in ALLOWED_CATALOG_VIDEO_EXTS or content_type.startswith("video/")
    is_doc = ext in ALLOWED_CATALOG_DOC_EXTS or content_type == "application/pdf"

    if not is_image and not is_video and not is_doc:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="INVALID_MEDIA_TYPE",
            message=f"Unsupported file format. Supported images: {', '.join(sorted(ALLOWED_CATALOG_IMAGE_EXTS))}. Supported videos: {', '.join(sorted(ALLOWED_CATALOG_VIDEO_EXTS))}. Supported documents: {', '.join(sorted(ALLOWED_CATALOG_DOC_EXTS))}.",
        )

    file_bytes = await file.read()
    if not file_bytes or len(file_bytes) == 0:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="EMPTY_FILE",
            message="Uploaded file cannot be empty",
        )

    if is_image and len(file_bytes) > MAX_CATALOG_IMAGE_BYTES:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="IMAGE_TOO_LARGE",
            message="Image exceeds maximum permitted size of 15MB",
        )

    if is_video and len(file_bytes) > MAX_CATALOG_VIDEO_BYTES:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="VIDEO_TOO_LARGE",
            message="Video exceeds maximum permitted size of 100MB",
        )

    if is_doc and len(file_bytes) > MAX_CATALOG_DOC_BYTES:
        raise APIException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            code="DOCUMENT_TOO_LARGE",
            message="Document exceeds maximum permitted size of 25MB",
        )

    if is_doc:
        if not file_bytes.startswith(b"%PDF-"):
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="INVALID_DOCUMENT",
                message="File content does not match valid PDF header (%PDF-)",
            )
        media_type = "pdf"
        folder = "products/manuals"
    elif is_video:
        if len(file_bytes) < 12 or (b"ftyp" not in file_bytes[4:12] and b"moov" not in file_bytes[:32]):
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="INVALID_VIDEO",
                message="File content does not match valid MP4/video header",
            )
        media_type = "video"
        folder = "products/videos"
    else:
        if ext == ".svg" or b"<svg" in file_bytes[:1024].lower() or b"<?xml" in file_bytes[:1024].lower():
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="INVALID_IMAGE",
                message="SVG images are not supported for product catalog media",
            )
        is_valid_img = (
            file_bytes.startswith(b"\xff\xd8\xff") or
            file_bytes.startswith(b"\x89PNG\r\n\x1a\n") or
            file_bytes.startswith(b"GIF87a") or
            file_bytes.startswith(b"GIF89a") or
            (len(file_bytes) >= 12 and file_bytes.startswith(b"RIFF") and file_bytes[8:12] == b"WEBP")
        )
        if not is_valid_img:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="INVALID_IMAGE",
                message="File content does not match valid image headers (JPEG, PNG, GIF, WebP)",
            )
        media_type = "image"
        folder = "products"

    try:
        upload_result = cloudinary_provider.upload(
            file_bytes=file_bytes,
            filename=filename,
            folder=folder,
            access="public",
        )
        url = upload_result.get("url")
        public_id = upload_result.get("public_id")
        if not url:
            raise RuntimeError("Storage provider did not return a valid asset URL")
    except Exception as e:
        raise APIException(
            status_code=http_status.HTTP_502_BAD_GATEWAY,
            code="MEDIA_UPLOAD_FAILED",
            message=f"Media upload failed: {str(e)}",
        )

    # Log audit event
    db.add(AuditEvent(
        user_id=admin.id,
        action="UPLOAD_PRODUCT_MEDIA",
        entity_type="CatalogMedia",
        entity_id=None,
        details=json.dumps({
            "filename": filename,
            "media_type": media_type,
            "size_bytes": len(file_bytes),
            "url": url,
        }),
    ))
    db.commit()

    return {
        "data": {
            "url": url,
            "public_id": public_id,
            "media_type": media_type,
            "filename": filename,
            "size_bytes": len(file_bytes),
        },
        "request_id": _request_id(request),
    }

# ---------------------------------------------------------------------------
# ADMIN-CAT-API-005 — GET /api/v1/admin/categories
# ---------------------------------------------------------------------------

@router.get("/admin/catalog/categories")
@router.get("/admin/categories")
def admin_list_categories(
    request: Request,
    admin: CurrentAdmin,
    db: Session = Depends(get_db),
):
    """ADMIN-CAT-API-005: list all categories including hidden."""
    _verify_catalog_role(admin)
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
    _verify_catalog_role(admin)
    category = catalog_service.create_category(db, body, admin)
    cache_delete_pattern("cache:cat:*")
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
    _verify_catalog_role(admin)
    try:
        cid = uuid.UUID(category_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="CATEGORY_NOT_FOUND",
            message="Category not found",
        )
    category = catalog_service.update_category(db, cid, body, admin)
    cache_delete_pattern("cache:cat:*")
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
    _verify_catalog_role(admin)
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
    _verify_catalog_role(admin)
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
    _verify_catalog_role(admin)
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
    cache_delete(f"cache:prod:detail:{pid}")
    cache_delete_pattern("cache:search:ac:*")
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
    _verify_catalog_role(admin)
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
