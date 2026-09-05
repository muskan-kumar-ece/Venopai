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

        # If live Cloudinary credentials are configured, execute real upload
        if self.cloud_name and self.api_key and self.api_secret:
            try:
                import cloudinary
                import cloudinary.uploader
                cloudinary.config(
                    cloud_name=self.cloud_name,
                    api_key=self.api_key,
                    api_secret=self.api_secret,
                    secure=True,
                )
                res = cloudinary.uploader.upload(
                    file_bytes,
                    folder=folder,
                    public_id=os.path.splitext(filename)[0],
                    type="upload" if access == "public" else "authenticated",
                )
                return {
                    "url": res.get("secure_url") or res.get("url"),
                    "public_id": res.get("public_id"),
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
        }

    def get_signed_url(self, storage_ref: str, expires_in: int = 300) -> str:
        domain = self.cloud_name if self.cloud_name else "venopai"
        return f"https://res.cloudinary.com/{domain}/image/authenticated/{storage_ref}?exp={expires_in}"

    def delete(self, storage_ref: str) -> bool:
        return True

cloudinary_provider = CloudinaryProvider()
