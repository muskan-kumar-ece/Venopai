import uuid
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.core.exceptions import APIException
from app.models.user import User, AuditEvent
from app.models.project import Quote, QuoteVersion, QuoteApproval, ManufacturingRequest
from app.services.catalog import _paise, _rupees
from app.services.tax import TaxService

def utcnow():
    return datetime.now(timezone.utc)


class QuoteService:
    """Sections 11, 32, 33, 44: Shared quotation lifecycle, immutable versioning, and approval."""

    @classmethod
    def create_quote(
        cls,
        db: Session,
        admin_user: User,
        request_type: str,
        request_id: str,
        line_items: List[Dict[str, str]],
        shipping_amount: str = "0.00",
        estimated_timeline: Optional[str] = None,
        valid_until: Optional[str] = None,
        terms: Optional[str] = None,
        scope_summary: Optional[str] = None,
    ) -> Quote:
        """ADMIN-QUOTE-API-001: Create initial quote in draft state."""
        if getattr(admin_user, "role", "") not in ("SUPER_ADMIN", "MANUFACTURING_MANAGER"):
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="INSUFFICIENT_PERMISSIONS",
                message="Only SUPER_ADMIN or MANUFACTURING_MANAGER can create quotes",
            )

        try:
            req_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="REQUEST_NOT_FOUND",
                message="Service request not found",
            )

        # Lookup manufacturing request
        mfg_req = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == req_uuid).first()
        if not mfg_req:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="REQUEST_NOT_FOUND",
                message="Manufacturing request not found",
            )

        user_id = mfg_req.user_id
        project_id = mfg_req.project_id

        # Calculate subtotal, shipping, tax
        subtotal_paise = sum(_paise(item["amount"]) for item in line_items)
        shipping_paise = _paise(shipping_amount) if shipping_amount else 0

        # Tax calculation (Doc 01 §13 / TAX-002: IGST or CGST+SGST default 18%)
        tax_res = TaxService.calculate_tax(
            merchandise_amount_paise=subtotal_paise,
            destination_state="Telangana",
            shipping_amount_paise=shipping_paise,
            tax_shipping=True,
        )
        tax_paise = tax_res.total_tax_paise
        tax_type = tax_res.tax_type
        total_paise = subtotal_paise + shipping_paise + tax_paise

        val_date = None
        if valid_until:
            try:
                val_date = datetime.fromisoformat(valid_until.replace("Z", "+00:00"))
            except Exception:
                pass

        quote_id = uuid.uuid4()
        quote = Quote(
            id=quote_id,
            user_id=user_id,
            project_id=project_id,
            request_type=request_type.lower(),
            request_id=mfg_req.id,
            status="draft",
            created_at=utcnow(),
        )
        db.add(quote)

        quote_version = QuoteVersion(
            id=uuid.uuid4(),
            quote_id=quote.id,
            version=1,
            status="draft",
            scope_summary=scope_summary or mfg_req.title,
            line_items=json.dumps(line_items),
            subtotal_paise=subtotal_paise,
            tax_paise=tax_paise,
            tax_type=tax_type,
            shipping_amount_paise=shipping_paise,
            total_amount=total_paise,
            estimated_timeline=estimated_timeline,
            valid_until=val_date,
            terms=terms,
            created_at=utcnow(),
        )
        db.add(quote_version)

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="QUOTE_DRAFT_CREATED",
            entity_type="Quote",
            entity_id=quote.id,
            details=json.dumps({"request_id": str(mfg_req.id), "version": 1, "total_paise": total_paise}),
            created_at=utcnow(),
        )
        db.add(audit)

        db.commit()
        db.refresh(quote)
        return quote

    @classmethod
    def send_quote(cls, db: Session, admin_user: User, quote_id: str) -> Quote:
        """ADMIN-QUOTE-API-003: Send quote to customer (draft -> sent, request -> quote_ready)."""
        if getattr(admin_user, "role", "") not in ("SUPER_ADMIN", "MANUFACTURING_MANAGER"):
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="INSUFFICIENT_PERMISSIONS",
                message="Only SUPER_ADMIN or MANUFACTURING_MANAGER can send quotes",
            )

        try:
            q_uuid = uuid.UUID(quote_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="QUOTE_NOT_FOUND", message="Quote not found")

        quote = db.query(Quote).filter(Quote.id == q_uuid).with_for_update().first()
        if not quote:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="QUOTE_NOT_FOUND", message="Quote not found")

        latest_version = (
            db.query(QuoteVersion)
            .filter(QuoteVersion.quote_id == quote.id)
            .order_by(QuoteVersion.version.desc())
            .first()
        )
        if not latest_version:
            raise APIException(status_code=http_status.HTTP_409_CONFLICT, code="NO_QUOTE_VERSION", message="No quote version exists")

        quote.status = "sent"
        latest_version.status = "sent"
        quote.updated_at = utcnow()

        # Associated request transitions to quote_ready (awaiting approval)
        if quote.request_id and quote.request_type == "manufacturing":
            mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == quote.request_id).first()
            if mfg:
                mfg.status = "quote_ready"
                mfg.updated_at = utcnow()

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="QUOTE_SENT",
            entity_type="Quote",
            entity_id=quote.id,
            details=json.dumps({"version": latest_version.version, "request_id": str(quote.request_id)}),
            created_at=utcnow(),
        )
        db.add(audit)

        db.commit()
        db.refresh(quote)
        return quote

    @classmethod
    def revise_quote(
        cls,
        db: Session,
        admin_user: User,
        quote_id: str,
        line_items: List[Dict[str, str]],
        shipping_amount: str = "0.00",
        estimated_timeline: Optional[str] = None,
        valid_until: Optional[str] = None,
        terms: Optional[str] = None,
        scope_summary: Optional[str] = None,
    ) -> QuoteVersion:
        """ADMIN-QUOTE-API-004: Create a new version, superseding previous version atomically."""
        if getattr(admin_user, "role", "") not in ("SUPER_ADMIN", "MANUFACTURING_MANAGER"):
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="INSUFFICIENT_PERMISSIONS",
                message="Only SUPER_ADMIN or MANUFACTURING_MANAGER can revise quotes",
            )

        try:
            q_uuid = uuid.UUID(quote_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="QUOTE_NOT_FOUND", message="Quote not found")

        quote = db.query(Quote).filter(Quote.id == q_uuid).with_for_update().first()
        if not quote:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="QUOTE_NOT_FOUND", message="Quote not found")

        latest_version = (
            db.query(QuoteVersion)
            .filter(QuoteVersion.quote_id == quote.id)
            .order_by(QuoteVersion.version.desc())
            .first()
        )
        if not latest_version:
            raise APIException(status_code=http_status.HTTP_409_CONFLICT, code="NO_QUOTE_VERSION", message="No quote version exists")

        # Invariant: Never revise an approved or paid version in place
        if latest_version.status in ("approved", "APPROVED", "paid", "PAID"):
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="QUOTE_LOCKED_POST_APPROVAL",
                message="Cannot revise an already approved quote version. Route to cancellation-review instead.",
            )

        # Supersede the current version
        latest_version.status = "superseded"

        # Calculate new financial values
        subtotal_paise = sum(_paise(item["amount"]) for item in line_items)
        shipping_paise = _paise(shipping_amount) if shipping_amount else 0
        tax_res = TaxService.calculate_tax(
            merchandise_amount_paise=subtotal_paise,
            destination_state="Telangana",
            shipping_amount_paise=shipping_paise,
            tax_shipping=True,
        )
        tax_paise = tax_res.total_tax_paise
        tax_type = tax_res.tax_type
        total_paise = subtotal_paise + shipping_paise + tax_paise

        val_date = None
        if valid_until:
            try:
                val_date = datetime.fromisoformat(valid_until.replace("Z", "+00:00"))
            except Exception:
                pass

        new_version_num = latest_version.version + 1
        new_version = QuoteVersion(
            id=uuid.uuid4(),
            quote_id=quote.id,
            version=new_version_num,
            status="sent",  # Revised quote moves directly to sent
            scope_summary=scope_summary or latest_version.scope_summary,
            line_items=json.dumps(line_items),
            subtotal_paise=subtotal_paise,
            tax_paise=tax_paise,
            tax_type=tax_type,
            shipping_amount_paise=shipping_paise,
            total_amount=total_paise,
            estimated_timeline=estimated_timeline or latest_version.estimated_timeline,
            valid_until=val_date or latest_version.valid_until,
            terms=terms or latest_version.terms,
            created_at=utcnow(),
        )
        db.add(new_version)

        quote.status = "sent"
        quote.updated_at = utcnow()

        # Reset request status back to quote_ready
        if quote.request_id and quote.request_type == "manufacturing":
            mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == quote.request_id).first()
            if mfg:
                mfg.status = "quote_ready"
                mfg.updated_at = utcnow()

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="QUOTE_REVISED",
            entity_type="Quote",
            entity_id=quote.id,
            details=json.dumps({
                "prior_version": latest_version.version,
                "new_version": new_version_num,
                "new_total_paise": total_paise,
            }),
            created_at=utcnow(),
        )
        db.add(audit)

        db.commit()
        db.refresh(new_version)
        return new_version

    @classmethod
    def get_quote_detail(cls, db: Session, user: User, quote_id: str) -> Tuple[Quote, QuoteVersion]:
        """QUOTE-API-002: Fetch current non-superseded quote detail (404 IDOR protected)."""
        try:
            q_uuid = uuid.UUID(quote_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="QUOTE_NOT_FOUND", message="Quote not found")

        is_admin = getattr(user, "is_superuser", False) or getattr(user, "role", "") in ("SUPER_ADMIN", "MANUFACTURING_MANAGER")

        query = db.query(Quote).filter(Quote.id == q_uuid)
        if not is_admin:
            query = query.filter(Quote.user_id == user.id)

        quote = query.first()
        if not quote:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="QUOTE_NOT_FOUND", message="Quote not found")

        latest_version = (
            db.query(QuoteVersion)
            .filter(QuoteVersion.quote_id == quote.id)
            .order_by(QuoteVersion.version.desc())
            .first()
        )
        if not latest_version:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="NO_QUOTE_VERSION", message="Quote version not found")

        return quote, latest_version

    @classmethod
    def list_quotes(cls, db: Session, user: User) -> List[Dict[str, Any]]:
        """QUOTE-API-001: List customer quotes across all requests."""
        quotes = db.query(Quote).filter(Quote.user_id == user.id).order_by(Quote.created_at.desc()).all()
        results = []
        for q in quotes:
            latest = (
                db.query(QuoteVersion)
                .filter(QuoteVersion.quote_id == q.id)
                .order_by(QuoteVersion.version.desc())
                .first()
            )
            if latest:
                results.append({
                    "id": str(q.id),
                    "request_type": q.request_type,
                    "request_id": str(q.request_id) if q.request_id else "",
                    "project_id": str(q.project_id) if q.project_id else None,
                    "status": latest.status,
                    "version_number": latest.version,
                    "total": _rupees(latest.total_amount),
                    "total_paise": latest.total_amount,
                    "valid_until": latest.valid_until.isoformat() if latest.valid_until else None,
                    "created_at": q.created_at.isoformat() if q.created_at else "",
                })
        return results

    @classmethod
    def list_quote_versions(cls, db: Session, user: User, quote_id: str) -> List[QuoteVersion]:
        """QUOTE-API-003: Version history list in reverse-chronological order."""
        quote, _ = cls.get_quote_detail(db=db, user=user, quote_id=quote_id)
        versions = (
            db.query(QuoteVersion)
            .filter(QuoteVersion.quote_id == quote.id)
            .order_by(QuoteVersion.version.desc())
            .all()
        )
        return versions

    @classmethod
    def get_specific_version(cls, db: Session, user: User, quote_id: str, version_id: str) -> QuoteVersion:
        """QUOTE-API-004: Read-only detail of a specific historical or current version."""
        quote, _ = cls.get_quote_detail(db=db, user=user, quote_id=quote_id)
        try:
            v_uuid = uuid.UUID(version_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="VERSION_NOT_FOUND", message="Version not found")

        version = db.query(QuoteVersion).filter(
            QuoteVersion.id == v_uuid,
            QuoteVersion.quote_id == quote.id,
        ).first()
        if not version:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="VERSION_NOT_FOUND", message="Version not found")
        return version

    @classmethod
    def approve_quote(cls, db: Session, user: User, quote_id: str) -> Tuple[Quote, QuoteVersion]:
        """QUOTE-API-005: Customer approves the current version (quote_ready -> payment_pending)."""
        quote, latest_version = cls.get_quote_detail(db=db, user=user, quote_id=quote_id)

        # Idempotency: re-approving an already approved quote is a no-op 200
        if latest_version.status in ("approved", "APPROVED"):
            return quote, latest_version

        if latest_version.status not in ("sent", "viewed", "draft"):
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="QUOTE_NOT_APPROVABLE",
                message=f"Quote version is in {latest_version.status} state and cannot be approved",
            )

        now = utcnow()
        val_until = latest_version.valid_until
        if val_until:
            if val_until.tzinfo is None:
                val_until = val_until.replace(tzinfo=timezone.utc)
            if val_until < now:
                latest_version.status = "expired"
                quote.status = "expired"
                db.commit()
                raise APIException(
                    status_code=http_status.HTTP_409_CONFLICT,
                    code="QUOTE_EXPIRED",
                    message="Quote has expired and can no longer be approved",
                )

        # 1. Update quote version and quote status
        latest_version.status = "accepted"
        quote.status = "accepted"
        quote.updated_at = now

        # 2. Create QuoteApproval record
        approval = QuoteApproval(
            id=uuid.uuid4(),
            quote_version_id=latest_version.id,
            user_id=user.id,
            status="APPROVED",
            created_at=now,
        )
        db.add(approval)

        # 3. Associated manufacturing request transitions quote_ready -> payment_pending
        if quote.request_id and quote.request_type == "manufacturing":
            mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == quote.request_id).first()
            if mfg:
                mfg.status = "payment_pending"
                mfg.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=user.id,
            action="QUOTE_APPROVED_BY_CUSTOMER",
            entity_type="Quote",
            entity_id=quote.id,
            details=json.dumps({"version": latest_version.version, "total_paise": latest_version.total_amount}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(quote)
        db.refresh(latest_version)
        return quote, latest_version

    @classmethod
    def reject_quote(cls, db: Session, user: User, quote_id: str, reason: Optional[str] = None) -> Tuple[Quote, QuoteVersion]:
        """QUOTE-API-006: Customer rejects quote version (request returns to clarification_needed)."""
        quote, latest_version = cls.get_quote_detail(db=db, user=user, quote_id=quote_id)

        if latest_version.status not in ("sent", "viewed", "draft"):
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="QUOTE_ALREADY_ACTIONED",
                message=f"Quote version is in {latest_version.status} state and cannot be rejected",
            )

        now = utcnow()
        latest_version.status = "rejected"
        quote.status = "REJECTED"
        quote.updated_at = now

        approval = QuoteApproval(
            id=uuid.uuid4(),
            quote_version_id=latest_version.id,
            user_id=user.id,
            status="REJECTED",
            reason=reason,
            created_at=now,
        )
        db.add(approval)

        # Associated request returns to clarification_needed for renegotiation
        if quote.request_id and quote.request_type == "manufacturing":
            mfg = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == quote.request_id).first()
            if mfg:
                mfg.status = "clarification_needed"
                mfg.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=user.id,
            action="QUOTE_REJECTED_BY_CUSTOMER",
            entity_type="Quote",
            entity_id=quote.id,
            details=json.dumps({"version": latest_version.version, "reason": reason}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(quote)
        db.refresh(latest_version)
        return quote, latest_version
