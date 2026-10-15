from typing import List, Union
from pydantic import AnyHttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "VenopAI"
    ENVIRONMENT: str = "development"
    API_V1_STR: str = "/api/v1"
    
    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "https://venopai.in",
        "https://www.venopai.in",
        "https://info.venopai.in",
        "https://admin.venopai.in",
        "https://venopai.vercel.app",
        "https://adminvenopai.vercel.app",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]
    
    @field_validator("CORS_ORIGINS", mode="before")
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    v = json.loads(v)
                except Exception:
                    pass
            if isinstance(v, str):
                return [i.strip().rstrip("/") for i in v.split(",") if i.strip()]
        if isinstance(v, list):
            return [str(i).strip().rstrip("/") for i in v if str(i).strip()]
        return [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
        ]
    
    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/venopai"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # JWT Auth
    SECRET_KEY: str = "supersecretkey_please_change_in_production"
    ALGORITHM: str = "HS256"
    # Medium: Hardened access token expirations relying on HttpOnly refresh rotation
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    CUSTOMER_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30  # 30 minutes
    ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15     # 15 minutes
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS: int = 24
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 60
    
    # Integrations
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""
    
    SHIPROCKET_MODE: str = "simulation"
    SHIPROCKET_EMAIL: str = ""
    SHIPROCKET_PASSWORD: str = ""
    SHIPROCKET_WEBHOOK_TOKEN: str = ""
    SHIPROCKET_API_BASE_URL: str = "https://apiv2.shiprocket.in/v1/external"
    SHIPROCKET_REQUEST_TIMEOUT_SECONDS: float = 15.0
    SHIPROCKET_CONNECT_TIMEOUT_SECONDS: float = 5.0
    SHIPROCKET_TOKEN_CACHE_BUFFER_SECONDS: int = 3600
    SHIPROCKET_ORIGIN_PINCODE: str = "500090"
    SHIPROCKET_COURIER_SELECTION_STRATEGY: str = "cheapest"
    DEFAULT_PRODUCT_WEIGHT_GRAMS: int = 200
    VOLUMETRIC_WEIGHT_DIVISOR: int = 5000
    SHIPROCKET_SERVICEABILITY_CACHE_TTL_SECONDS: int = 3600
    SHIPROCKET_PICKUP_LOCATION_NAME: str = "Primary"
    
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "notifications@venopai.in"
    CLIENT_FRONTEND_URL: str = "https://venopai.vercel.app"
    
    SENTRY_DSN: str = ""
    SENTRY_ENVIRONMENT: str = "development"
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1

    # Tax & Business Operations (TAX-001 - TAX-005)
    # TAX-002: Business State of Supply for determining intra-state vs inter-state GST.
    # Configurable via environment variable VENOPAI_STATE_OF_SUPPLY.
    VENOPAI_STATE_OF_SUPPLY: str = "Telangana"

    # TAX-003: Tax display/pricing mode: "TAX_EXCLUSIVE" (default) or "TAX_INCLUSIVE".
    # Configurable via environment variable TAX_PRICING_MODE.
    TAX_PRICING_MODE: str = "TAX_EXCLUSIVE"

    # TAX-005: Centrally controlled tax calculation rate.
    # Note: Document 01 intentionally does NOT lock tax rates as a permanent business rule.
    # DEFAULT_GST_RATE_PERCENT is an operational configuration value, NOT an immutable business policy.
    DEFAULT_GST_RATE_PERCENT: int = 18

    # Document 01 §34 Open Questions & Document 02 §19: Consultation Inactivity Thresholds
    # Configurable operational defaults: 14 days auto-close, 10 days reminder notification
    CONSULTATION_INACTIVITY_DAYS: int = 14
    @field_validator("SHIPROCKET_ORIGIN_PINCODE")
    @classmethod
    def validate_origin_pincode(cls, v: str) -> str:
        clean = v.strip()
        if not (len(clean) == 6 and clean.isdigit() and clean[0] != "0"):
            raise ValueError("SHIPROCKET_ORIGIN_PINCODE must be a valid 6-digit Indian PIN code without leading zero.")
        return clean

    @field_validator("SHIPROCKET_COURIER_SELECTION_STRATEGY")
    @classmethod
    def validate_courier_strategy(cls, v: str) -> str:
        clean = v.strip().lower()
        valid = {"cheapest", "recommended", "fastest"}
        if clean not in valid:
            raise ValueError(f"SHIPROCKET_COURIER_SELECTION_STRATEGY must be one of {valid}.")
        return clean

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            # 1. Secret Key
            if self.SECRET_KEY == "supersecretkey_please_change_in_production" or len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "CRITICAL SECURITY ERROR: SECRET_KEY must be set to a secure random string of at least 32 characters in production environments."
                )

            # 2. Razorpay Live Configuration
            if not self.RAZORPAY_KEY_ID or self.RAZORPAY_KEY_ID.startswith("rzp_test_mock"):
                raise ValueError("CRITICAL SECURITY ERROR: Live RAZORPAY_KEY_ID is required in production.")
            if not self.RAZORPAY_KEY_SECRET or self.RAZORPAY_KEY_SECRET in ("mock_secret", "test_secret"):
                raise ValueError("CRITICAL SECURITY ERROR: Live RAZORPAY_KEY_SECRET is required in production.")
            if not self.RAZORPAY_WEBHOOK_SECRET or self.RAZORPAY_WEBHOOK_SECRET in ("mock_webhook_secret", "test_secret"):
                raise ValueError("CRITICAL SECURITY ERROR: Live RAZORPAY_WEBHOOK_SECRET is required in production.")

            # 3. Cloudinary Configuration
            if not self.CLOUDINARY_CLOUD_NAME or not self.CLOUDINARY_API_KEY or not self.CLOUDINARY_API_SECRET:
                raise ValueError("CRITICAL SECURITY ERROR: CLOUDINARY credentials are required in production.")

            # 4. Shiprocket Configuration
            if self.SHIPROCKET_MODE.lower() not in ("simulation", "live"):
                raise ValueError("CRITICAL SECURITY ERROR: SHIPROCKET_MODE must be either 'simulation' or 'live'.")
            if not self.SHIPROCKET_EMAIL or not self.SHIPROCKET_PASSWORD or not self.SHIPROCKET_WEBHOOK_TOKEN:
                raise ValueError("CRITICAL SECURITY ERROR: SHIPROCKET credentials and webhook token are required in production.")

            # 5. CORS Origins must not contain localhost in production
            for origin in self.CORS_ORIGINS:
                if "localhost" in origin.lower() or "127.0.0.1" in origin:
                    raise ValueError(f"CRITICAL SECURITY ERROR: Localhost CORS origin '{origin}' is not permitted in production.")

            # 6. Redis URL must not be unencrypted localhost
            if "localhost:6379" in self.REDIS_URL or "127.0.0.1:6379" in self.REDIS_URL:
                raise ValueError("CRITICAL SECURITY ERROR: Localhost Redis is not permitted in production.")

        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()

