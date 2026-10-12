import os
import hashlib
from typing import Protocol, Optional, Dict, Any
from app.core.config import settings

class FileStorageProvider(Protocol):
    def upload(self, file_bytes: bytes, filename: str, folder: str = "products", access: str = "public") -> Dict[str, Any]: ...
    def get_signed_url(self, storage_ref: str, expires_in: int = 300) -> str: ...
    def delete(self, storage_ref: str) -> bool: ...

class CloudinaryProvider:
    """Cloudinary integration provider implementing FileStorageProvider.
    Supports public product images and access-controlled private project files.
    """
    def __init__(
        self,
        cloud_name: Optional[str] = None,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
    ):
        self.cloud_name = cloud_name or settings.CLOUDINARY_CLOUD_NAME
        self.api_key = api_key or settings.CLOUDINARY_API_KEY
        self.api_secret = api_secret or settings.CLOUDINARY_API_SECRET

    def upload(
        self,
        file_bytes: bytes,
        filename: str,
        folder: str = "products",
        access: str = "public",
    ) -> Dict[str, Any]:
        if not file_bytes:
            raise ValueError("File bytes cannot be empty")

        # If live Cloudinary credentials are configured and not running under pytest, execute real upload
        if self.cloud_name and self.api_key and self.api_secret and not os.getenv("PYTEST_CURRENT_TEST"):
            try:
                import io
                import cloudinary
                import cloudinary.uploader
                cloudinary.config(
                    cloud_name=self.cloud_name,
                    api_key=self.api_key,
                    api_secret=self.api_secret,
                    secure=True,
                )
                file_hash = hashlib.sha256(file_bytes).hexdigest()[:8]
                clean_name = os.path.splitext(filename)[0].replace(" ", "_")
                unique_public_id = f"{file_hash}_{clean_name}"
                res = cloudinary.uploader.upload(
                    io.BytesIO(file_bytes),
                    folder=folder,
                    public_id=unique_public_id,
                    resource_type="auto",
                    type="upload" if access == "public" else "authenticated",
                )
                return {
                    "url": res.get("secure_url") or res.get("url"),
                    "public_id": res.get("public_id"),
                    "resource_type": res.get("resource_type", "image"),
                    "format": res.get("format", ""),
                }
            except Exception as e:
                raise RuntimeError(f"Cloudinary upload failed: {str(e)}")

        # Local development / deterministic mock fallback
        file_hash = hashlib.sha256(file_bytes).hexdigest()[:12]
        clean_name = filename.replace(" ", "_")
        public_id = f"{folder}/{file_hash}_{clean_name}"
        domain = self.cloud_name if self.cloud_name else "venopai"
        url = f"https://res.cloudinary.com/{domain}/image/upload/{folder}/{file_hash}_{clean_name}"
        return {
            "url": url,
            "public_id": public_id,
            "resource_type": "image",
            "format": os.path.splitext(filename)[1].lstrip("."),
        }

    def get_signed_url(self, storage_ref: str, expires_in: int = 300, resource_type: Optional[str] = None) -> str:
        if self.cloud_name and self.api_key and self.api_secret and not os.getenv("PYTEST_CURRENT_TEST"):
            try:
                import time
                import cloudinary
                import cloudinary.utils
                cloudinary.config(
                    cloud_name=self.cloud_name,
                    api_key=self.api_key,
                    api_secret=self.api_secret,
                    secure=True,
                )
                ext = ""
                if "." in storage_ref:
                    ext = storage_ref.rsplit(".", 1)[1].lower()
                
                raw_extensions = {
                    "zip", "step", "stp", "stl", "dxf", "dwg", "gerber", "gbr", "drl",
                    "pcb", "sch", "kicad_pcb", "kicad_sch", "kicad_pro", "bin", "hex",
                    "elf", "csv", "txt", "json", "pdf"
                }
                inferred_type = resource_type or ("raw" if ext in raw_extensions else "image")
                expires_at = int(time.time()) + expires_in
                signed_url = cloudinary.utils.private_download_url(
                    storage_ref,
                    format=ext or None,
                    resource_type=inferred_type,
                    type="authenticated",
                    expires_at=expires_at,
                )
                if signed_url:
                    return signed_url
            except Exception:
                pass

        domain = self.cloud_name if self.cloud_name else "venopai"
        return f"https://res.cloudinary.com/{domain}/image/authenticated/{storage_ref}?exp={expires_in}"

    def delete(self, storage_ref: str, resource_type: Optional[str] = None) -> bool:
        if self.cloud_name and self.api_key and self.api_secret and not os.getenv("PYTEST_CURRENT_TEST"):
            try:
                import cloudinary
                import cloudinary.uploader
                cloudinary.config(
                    cloud_name=self.cloud_name,
                    api_key=self.api_key,
                    api_secret=self.api_secret,
                    secure=True,
                )
                ext = storage_ref.rsplit(".", 1)[1].lower() if "." in storage_ref else ""
                raw_extensions = {
                    "zip", "step", "stp", "stl", "dxf", "dwg", "gerber", "gbr", "drl",
                    "pcb", "sch", "kicad_pcb", "kicad_sch", "kicad_pro", "bin", "hex",
                    "elf", "csv", "txt", "json", "pdf"
                }
                inferred_type = resource_type or ("raw" if ext in raw_extensions else "image")
                res = cloudinary.uploader.destroy(storage_ref, resource_type=inferred_type, type="authenticated")
                if res.get("result") in ("ok", "not found"):
                    return True
                res_pub = cloudinary.uploader.destroy(storage_ref, resource_type=inferred_type, type="upload")
                return res_pub.get("result") in ("ok", "not found")
            except Exception as e:
                raise RuntimeError(f"Cloudinary delete failed: {str(e)}")
        return True

cloudinary_provider = CloudinaryProvider()
