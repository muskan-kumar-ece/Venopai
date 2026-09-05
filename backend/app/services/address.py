from typing import List, Optional, Dict, Any
import uuid
from sqlalchemy.orm import Session
from fastapi import status as http_status

from app.models.user import Address, User
from app.integrations.shiprocket import shiprocket_provider
from app.core.exceptions import APIException

def _serialize_address(address: Address, check_serviceability: bool = True) -> Dict[str, Any]:
    warning = None
    if check_serviceability:
        serviceable = shiprocket_provider.check_serviceability(address.pincode)
        if not serviceable:
            warning = f"PIN code {address.pincode} may not be currently serviceable for delivery"

    return {
        "id": str(address.id),
        "recipient_name": address.recipient_name,
        "phone": address.phone,
        "line1": address.line1,
        "line2": address.line2,
        "city": address.city,
        "state": address.state,
        "pincode": address.pincode,
        "country": address.country,
        "is_default": address.is_default,
        "serviceability_warning": warning,
        "created_at": address.created_at.isoformat() if address.created_at else None,
        "updated_at": address.updated_at.isoformat() if address.updated_at else None,
    }


def list_addresses(db: Session, user: User) -> List[Dict[str, Any]]:
    """USER-API-005: List customer's saved addresses."""
    addresses = (
        db.query(Address)
        .filter(Address.user_id == user.id)
        .order_by(Address.is_default.desc(), Address.created_at.desc())
        .all()
    )
    return [_serialize_address(a) for a in addresses]


def create_address(db: Session, user: User, data: Dict[str, Any]) -> Dict[str, Any]:
    """USER-API-006: Add new address.
    Atomic default switch if is_default=True.
    """
    is_default = data.get("is_default", False)

    # If first address for user, automatically default to True
    existing_count = db.query(Address).filter(Address.user_id == user.id).count()
    if existing_count == 0:
        is_default = True

    if is_default:
        # Atomic unset of prior defaults
        db.query(Address).filter(Address.user_id == user.id).update({"is_default": False})

    address = Address(
        user_id=user.id,
        recipient_name=data["recipient_name"],
        phone=data["phone"],
        line1=data["line1"],
        line2=data.get("line2"),
        city=data["city"],
        state=data["state"],
        pincode=data["pincode"],
        country="India",
        is_default=is_default,
    )
    db.add(address)
    db.commit()
    db.refresh(address)

    return _serialize_address(address)


def update_address(db: Session, user: User, address_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """USER-API-007: Edit address.
    IDOR protection: return 404 if not found or not owned.
    """
    try:
        a_uuid = uuid.UUID(address_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="ADDRESS_NOT_FOUND",
            message="Address not found",
        )

    address = db.query(Address).filter(Address.id == a_uuid, Address.user_id == user.id).first()
    if not address:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="ADDRESS_NOT_FOUND",
            message="Address not found",
        )

    if data.get("is_default") is True and not address.is_default:
        db.query(Address).filter(Address.user_id == user.id).update({"is_default": False})

    for k, v in data.items():
        if v is not None:
            setattr(address, k, v)

    db.commit()
    db.refresh(address)
    return _serialize_address(address)


def delete_address(db: Session, user: User, address_id: str) -> Dict[str, Any]:
    """USER-API-008: Delete address.
    IDOR protection: return 404 if not found or not owned.
    If deleting default address, assign another existing address as default.
    """
    try:
        a_uuid = uuid.UUID(address_id)
    except ValueError:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="ADDRESS_NOT_FOUND",
            message="Address not found",
        )

    address = db.query(Address).filter(Address.id == a_uuid, Address.user_id == user.id).first()
    if not address:
        raise APIException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            code="ADDRESS_NOT_FOUND",
            message="Address not found",
        )

    was_default = address.is_default
    db.delete(address)
    db.flush()

    if was_default:
        # Reassign default to the most recent remaining address
        next_default = (
            db.query(Address)
            .filter(Address.user_id == user.id)
            .order_by(Address.created_at.desc())
            .first()
        )
        if next_default:
            next_default.is_default = True

    db.commit()
    return {"id": str(a_uuid), "deleted": True}
