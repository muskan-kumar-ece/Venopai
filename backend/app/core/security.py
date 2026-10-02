from datetime import datetime, timedelta, timezone
from typing import Any, Union
import hashlib
import secrets
import bcrypt
import jwt
from app.core.config import settings

def get_password_hash(password: str) -> str:
    """Hash password using native adaptive bcrypt."""
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against stored bcrypt hash."""
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False

def hash_token(token: str) -> str:
    """SHA-256 hash for opaque verification and reset tokens at rest."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def create_access_token(
    subject: Union[str, Any],
    role: str = "customer",
    is_admin: bool = False,
    audience: str = "customer",
    expires_delta: timedelta = None,
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire_minutes = (
            getattr(settings, "ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES", 720)
            if (is_admin or audience == "admin")
            else getattr(settings, "CUSTOMER_ACCESS_TOKEN_EXPIRE_MINUTES", settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "role": role,
        "is_admin": is_admin,
        "aud": audience,
        "type": "access",
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_refresh_token() -> str:
    return secrets.token_urlsafe(64)

def create_csrf_token() -> str:
    return secrets.token_urlsafe(32)

def create_opaque_token() -> str:
    return secrets.token_urlsafe(32)

def validate_password_strength(password: str) -> tuple[bool, str]:
    """Validate password complexity against corporate security baseline.
    Rules: min 10 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character.
    """
    import re
    if not password or len(password) < 10:
        return False, "Password must be at least 10 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter (A-Z)."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter (a-z)."
    if not re.search(r"\d", password):
        return False, "Password must contain at least one numerical digit (0-9)."
    if not re.search(r"[@$!%*?&_\-#^~+=><.,:;(){}\[\]]", password):
        return False, "Password must contain at least one special character (@$!%*?& etc.)."
    return True, ""

def generate_secure_password(length: int = 14) -> str:
    """Generate a high-entropy temporary password conforming to complexity rules."""
    import string
    if length < 12:
        length = 12
    upper = secrets.choice(string.ascii_uppercase)
    lower = secrets.choice(string.ascii_lowercase)
    digit = secrets.choice(string.digits)
    special = secrets.choice("!@#$%^&*")
    all_chars = string.ascii_letters + string.digits + "!@#$%^&*"
    remaining = [secrets.choice(all_chars) for _ in range(length - 4)]
    password_list = [upper, lower, digit, special] + remaining
    secrets.SystemRandom().shuffle(password_list)
    return "".join(password_list)
