from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "VenopAI"
    API_V1_STR: str = "/api/v1"
    
    # CORS
    CORS_ORIGINS: List[AnyHttpUrl] | str = []
    
    @field_validator("CORS_ORIGINS", mode="before")
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)
    
    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/venopai"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # JWT Auth
    SECRET_KEY: str = "supersecretkey_please_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS: int = 24
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 60
    
    # Integrations
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    
    SHIPROCKET_EMAIL: str = ""
    SHIPROCKET_PASSWORD: str = ""
    
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    
    RESEND_API_KEY: str = ""
    
    SENTRY_DSN: str = ""

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

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True
    )

settings = Settings()

