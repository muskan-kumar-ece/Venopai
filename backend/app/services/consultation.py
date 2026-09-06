import uuid
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.core.exceptions import APIException
from app.models.user import User, AuditEvent
from app.models.project import ConsultationRequest, ConsultationClarification, ProjectFile, Quote
from app.services.quote import QuoteService

def utcnow():
    return datetime.now(timezone.utc)


class ConsultationService:
    """Sections 7.14, 25, 45: Consultation request lifecycle, discussion thread, and quote conversion."""

    @classmethod
    def _check_admin_role(cls, admin_user: User):
        role = getattr(admin_user, "role", "")
        if role not in ("SUPER_ADMIN", "MANUFACTURING_MANAGER"):
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="INSUFFICIENT_PERMISSIONS",
                message="Role does not have permission to manage consultations",
            )

    @classmethod
    def submit_consultation(
        cls,
        db: Session,
        user: User,
        topic: str,
        description: str,
        file_ids: Optional[List[str]] = None,
    ) -> ConsultationRequest:
        """CONSULT-API-001: Submit consultation request."""
        if user.status != "verified" and not getattr(user, "is_verified", False):
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="EMAIL_NOT_VERIFIED",
                message="Email verification required before submitting a consultation request",
            )

        clean_topic = topic.strip()
        clean_desc = description.strip()
        if not clean_topic or not clean_desc:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="INVALID_PAYLOAD",
                message="Topic and description cannot be empty",
            )

        now = utcnow()
        req_id = uuid.uuid4()
        req = ConsultationRequest(
            id=req_id,
            user_id=user.id,
            topic=clean_topic,
            description=clean_desc,
            status="submitted",
            created_at=now,
            updated_at=now,
        )
        db.add(req)

        # Associate files
        if file_ids:
            for fid_str in file_ids:
                try:
                    fid = uuid.UUID(fid_str)
                    file_obj = db.query(ProjectFile).filter(
                        ProjectFile.id == fid,
                        ProjectFile.owner_id == user.id,
                    ).first()
                    if file_obj:
                        file_obj.association_type = "consultation"
                        file_obj.association_id = req_id
                except ValueError:
                    pass

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=user.id,
            action="CONSULTATION_SUBMITTED",
            entity_type="ConsultationRequest",
            entity_id=req_id,
            details=json.dumps({"topic": clean_topic}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def list_consultations(
        cls,
        db: Session,
        user: User,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[ConsultationRequest], int]:
        """CONSULT-API-002: List customer's own consultations."""
        query = db.query(ConsultationRequest).filter(ConsultationRequest.user_id == user.id)
        total = query.count()
        requests = (
            query.order_by(ConsultationRequest.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return requests, total

    @classmethod
    def get_consultation(
        cls,
        db: Session,
        user: User,
        consultation_id: str,
    ) -> ConsultationRequest:
        """CONSULT-API-003: Customer consultation detail with strict 404 IDOR protection."""
        try:
            req_uuid = uuid.UUID(consultation_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="CONSULTATION_NOT_FOUND",
                message="Consultation not found",
            )

        is_admin = getattr(user, "is_superuser", False) or getattr(user, "role", "") in ("SUPER_ADMIN", "MANUFACTURING_MANAGER")
        query = db.query(ConsultationRequest).filter(ConsultationRequest.id == req_uuid)
        if not is_admin:
            query = query.filter(ConsultationRequest.user_id == user.id)

        req = query.first()
        if not req:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="CONSULTATION_NOT_FOUND",
                message="Consultation not found",
            )
        return req

    @classmethod
    def resolve_consultation(
        cls,
        db: Session,
        user: User,
        consultation_id: str,
    ) -> ConsultationRequest:
        """CONSULT-API-004: Customer marks consultation as resolved/completed."""
        req = cls.get_consultation(db, user, consultation_id)
        now = utcnow()
        req.status = "completed"
        req.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=user.id,
            action="CONSULTATION_RESOLVED_BY_CUSTOMER",
            entity_type="ConsultationRequest",
            entity_id=req.id,
            details=json.dumps({"status": "completed"}),
            created_at=now,
        )
        db.add(audit)
        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def list_clarifications(
        cls,
        db: Session,
        user: User,
        consultation_id: str,
    ) -> List[ConsultationClarification]:
        """CONSULT-API-005: List discussion/clarifications for consultation."""
        req = cls.get_consultation(db, user, consultation_id)
        return (
            db.query(ConsultationClarification)
            .filter(ConsultationClarification.request_id == req.id)
            .order_by(ConsultationClarification.raised_at.asc())
            .all()
        )

    @classmethod
    def respond_clarification(
        cls,
        db: Session,
        user: User,
        consultation_id: str,
        clarification_id: str,
        text: str,
        attached_file_ids: Optional[List[str]] = None,
    ) -> ConsultationClarification:
        """CONSULT-API-006: Customer responds to consultation clarification question."""
        req = cls.get_consultation(db, user, consultation_id)
        try:
            c_uuid = uuid.UUID(clarification_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="CLARIFICATION_NOT_FOUND",
                message="Clarification not found",
            )

        clarification = db.query(ConsultationClarification).filter(
            ConsultationClarification.id == c_uuid,
            ConsultationClarification.request_id == req.id,
        ).first()
        if not clarification:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="CLARIFICATION_NOT_FOUND",
                message="Clarification not found",
            )

        now = utcnow()
        clarification.status = "resolved"
        clarification.response_text = text.strip()
        clarification.responded_at = now
        if attached_file_ids:
            clarification.attached_file_ids = json.dumps(attached_file_ids)

        # Transition consultation to in_progress if currently submitted or responded
        if req.status in ("submitted", "responded"):
            req.status = "in_progress"
            req.updated_at = now

        db.commit()
        db.refresh(clarification)
        return clarification

    # =========================================================================
    # ADMIN ENDPOINTS (ADMIN-CONSULT-API-001..004)
    # =========================================================================

    @classmethod
    def admin_list_queue(
        cls,
        db: Session,
        admin_user: User,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[ConsultationRequest], int]:
        """ADMIN-CONSULT-API-001: Queue view for consultations."""
        cls._check_admin_role(admin_user)
        query = db.query(ConsultationRequest)
        if status:
            query = query.filter(ConsultationRequest.status == status.strip().lower())
        total = query.count()
        requests = (
            query.order_by(ConsultationRequest.created_at.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return requests, total

    @classmethod
    def admin_get_consultation(
        cls,
        db: Session,
        admin_user: User,
        consultation_id: str,
    ) -> ConsultationRequest:
        """ADMIN-CONSULT-API-001: Full detail view for admin."""
        cls._check_admin_role(admin_user)
        try:
            req_uuid = uuid.UUID(consultation_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="CONSULTATION_NOT_FOUND",
                message="Consultation not found",
            )
        req = db.query(ConsultationRequest).filter(ConsultationRequest.id == req_uuid).first()
        if not req:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="CONSULTATION_NOT_FOUND",
                message="Consultation not found",
            )
        return req

    @classmethod
    def admin_respond(
        cls,
        db: Session,
        admin_user: User,
        consultation_id: str,
        response_text: str,
        internal_notes: Optional[str] = None,
    ) -> ConsultationRequest:
        """ADMIN-CONSULT-API-003: Admin posts response or questions in thread."""
        cls._check_admin_role(admin_user)
        req = cls.admin_get_consultation(db, admin_user, consultation_id)

        clean_resp = response_text.strip()
        now = utcnow()
        req.admin_response = clean_resp
        if internal_notes:
            req.internal_notes = internal_notes.strip()
        req.status = "responded"
        req.updated_at = now

        # Also add a clarification record for threaded customer response
        clarification = ConsultationClarification(
            id=uuid.uuid4(),
            request_id=req.id,
            question=clean_resp,
            raised_by_id=admin_user.id,
            raised_at=now,
            status="awaiting_response",
        )
        db.add(clarification)

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="CONSULTATION_ADMIN_RESPONDED",
            entity_type="ConsultationRequest",
            entity_id=req.id,
            details=json.dumps({"response_preview": clean_resp[:100]}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def admin_convert_to_quote(
        cls,
        db: Session,
        admin_user: User,
        consultation_id: str,
        line_items: List[Dict[str, str]],
        shipping_amount: str = "0.00",
        destination_state: Optional[str] = None,
        estimated_timeline: Optional[str] = None,
        valid_until: Optional[str] = None,
        terms: Optional[str] = None,
        scope_summary: Optional[str] = None,
    ) -> Quote:
        """ADMIN-CONSULT-API-002: Convert consultation into billable engagement."""
        cls._check_admin_role(admin_user)
        req = cls.admin_get_consultation(db, admin_user, consultation_id)

        # Invoke central QuoteService
        quote = QuoteService.create_quote(
            db=db,
            admin_user=admin_user,
            request_type="consultation",
            request_id=str(req.id),
            line_items=line_items,
            shipping_amount=shipping_amount,
            destination_state=destination_state,
            estimated_timeline=estimated_timeline,
            valid_until=valid_until,
            terms=terms,
            scope_summary=scope_summary or f"Engineering engagement converted from consultation: {req.topic}",
        )

        now = utcnow()
        req.converted_quote_id = quote.id
        req.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="CONSULTATION_CONVERTED_TO_QUOTE",
            entity_type="ConsultationRequest",
            entity_id=req.id,
            details=json.dumps({"quote_id": str(quote.id)}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(req)
        return quote

    @classmethod
    def admin_close(
        cls,
        db: Session,
        admin_user: User,
        consultation_id: str,
        notes: Optional[str] = None,
    ) -> ConsultationRequest:
        """ADMIN-CONSULT-API-004: Admin marks consultation closed."""
        cls._check_admin_role(admin_user)
        req = cls.admin_get_consultation(db, admin_user, consultation_id)

        now = utcnow()
        req.status = "closed"
        if notes:
            req.internal_notes = notes.strip()
        req.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="CONSULTATION_CLOSED_BY_ADMIN",
            entity_type="ConsultationRequest",
            entity_id=req.id,
            details=json.dumps({"notes": notes}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def raise_clarification(
        cls,
        db: Session,
        admin_user: User,
        consultation_id: str,
        question: str,
    ) -> ConsultationClarification:
        cls._check_admin_role(admin_user)
        req = cls.admin_get_consultation(db, admin_user, consultation_id)
        clean_q = question.strip()
        if not clean_q:
            raise APIException(status_code=http_status.HTTP_400_BAD_REQUEST, code="EMPTY_QUESTION", message="Question cannot be empty")
        now = utcnow()
        clar = ConsultationClarification(
            id=uuid.uuid4(),
            request_id=req.id,
            question=clean_q,
            raised_by_id=admin_user.id,
            raised_at=now,
            status="awaiting_response",
        )
        db.add(clar)
        req.status = "in_progress"
        req.updated_at = now
        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="CONSULTATION_CLARIFICATION_RAISED",
            entity_type="ConsultationClarification",
            entity_id=clar.id,
            details=json.dumps({"request_id": str(req.id)}),
            created_at=now,
        )
        db.add(audit)
        db.commit()
        db.refresh(clar)
        return clar

    @classmethod
    def resolve_clarification(
        cls,
        db: Session,
        admin_user: User,
        consultation_id: str,
        clarification_id: str,
    ) -> ConsultationClarification:
        cls._check_admin_role(admin_user)
        req = cls.admin_get_consultation(db, admin_user, consultation_id)
        try:
            c_uuid = uuid.UUID(clarification_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="CLARIFICATION_NOT_FOUND", message="Clarification not found")
        clar = db.query(ConsultationClarification).filter(
            ConsultationClarification.id == c_uuid,
            ConsultationClarification.request_id == req.id,
        ).first()
        if not clar:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="CLARIFICATION_NOT_FOUND", message="Clarification not found")
        now = utcnow()
        clar.status = "resolved"
        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="CONSULTATION_CLARIFICATION_RESOLVED",
            entity_type="ConsultationClarification",
            entity_id=clar.id,
            details=json.dumps({"request_id": str(req.id)}),
            created_at=now,
        )
        db.add(audit)
        db.commit()
        db.refresh(clar)
        return clar
