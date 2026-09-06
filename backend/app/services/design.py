import uuid
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.core.exceptions import APIException
from app.models.user import User, AuditEvent
from app.models.project import (
    DesignRequest,
    DesignClarification,
    DesignStatusUpdate,
    ProjectFile,
)

def utcnow():
    return datetime.now(timezone.utc)

VALID_DESIGN_SCOPES = ("schematic_only", "pcb_layout", "both")

class DesignService:
    """Sections 7.15, 26, 43: PCB / Electronics Design service lifecycle."""

    @classmethod
    def _check_admin_role(cls, admin_user: User):
        role = getattr(admin_user, "role", "")
        is_super = getattr(admin_user, "is_superuser", False) or getattr(admin_user, "is_admin", False)
        if not is_super and role not in ("SUPER_ADMIN", "DESIGN_MANAGER", "MANUFACTURING_MANAGER"):
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="INSUFFICIENT_PERMISSIONS",
                message="Role does not have permission to manage design requests",
            )

    @classmethod
    def submit_request(
        cls,
        db: Session,
        user: User,
        title: str,
        project_overview: str,
        design_scope: str = "pcb_layout",
        reference_file_ids: Optional[List[str]] = None,
        additional_notes: Optional[str] = None,
    ) -> DesignRequest:
        """DESIGN-API-001: Submit PCB/Electronics design request."""
        if user.status != "verified" and not getattr(user, "is_verified", False):
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="EMAIL_NOT_VERIFIED",
                message="Email verification required before submitting a design request",
            )

        clean_title = title.strip()
        clean_overview = project_overview.strip()
        clean_scope = design_scope.strip().lower()

        if not clean_title or not clean_overview:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="INVALID_PAYLOAD",
                message="Title and project overview are required",
            )

        if clean_scope not in VALID_DESIGN_SCOPES:
            raise APIException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                code="INVALID_DESIGN_SCOPE",
                message=f"design_scope must be one of: {', '.join(VALID_DESIGN_SCOPES)}",
            )

        now = utcnow()
        req_id = uuid.uuid4()
        req = DesignRequest(
            id=req_id,
            user_id=user.id,
            title=clean_title,
            project_overview=clean_overview,
            design_scope=clean_scope,
            additional_notes=additional_notes.strip() if additional_notes else None,
            status="submitted",
            created_at=now,
            updated_at=now,
        )
        db.add(req)

        # Associate customer reference files
        if reference_file_ids:
            for fid_str in reference_file_ids:
                try:
                    fid = uuid.UUID(fid_str)
                    file_obj = db.query(ProjectFile).filter(
                        ProjectFile.id == fid,
                        ProjectFile.owner_id == user.id,
                    ).first()
                    if file_obj:
                        file_obj.association_type = "design"
                        file_obj.association_id = req_id
                except ValueError:
                    pass

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=user.id,
            action="DESIGN_REQUEST_SUBMITTED",
            entity_type="DesignRequest",
            entity_id=req_id,
            details=json.dumps({"title": clean_title, "scope": clean_scope}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def list_requests(
        cls,
        db: Session,
        user: User,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[DesignRequest], int]:
        """DESIGN-API-002: List customer's own design requests."""
        query = db.query(DesignRequest).filter(DesignRequest.user_id == user.id)
        total = query.count()
        requests = (
            query.order_by(DesignRequest.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return requests, total

    @classmethod
    def get_request(
        cls,
        db: Session,
        user: User,
        request_id: str,
    ) -> DesignRequest:
        """DESIGN-API-003: Customer design request detail with strict 404 IDOR protection."""
        try:
            req_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="REQUEST_NOT_FOUND",
                message="Design request not found",
            )

        is_admin = getattr(user, "is_superuser", False) or getattr(user, "role", "") in ("SUPER_ADMIN", "MANUFACTURING_MANAGER")
        query = db.query(DesignRequest).filter(DesignRequest.id == req_uuid)
        if not is_admin:
            query = query.filter(DesignRequest.user_id == user.id)

        req = query.first()
        if not req:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="REQUEST_NOT_FOUND",
                message="Design request not found",
            )
        return req

    @classmethod
    def cancel_request(
        cls,
        db: Session,
        user: User,
        request_id: str,
        reason: Optional[str] = None,
    ) -> DesignRequest:
        """DESIGN-API-004: Customer cancels design request (mirrors MFG rules)."""
        req = cls.get_request(db, user, request_id)

        if req.status in ("cancelled", "completed", "delivered"):
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="INVALID_STATE_FOR_CANCELLATION",
                message=f"Cannot cancel a request in '{req.status}' state",
            )

        now = utcnow()
        # Pre-execution: immediate cancellation
        if req.status in ("submitted", "under_review", "clarification_needed", "requirements_confirmed", "quote_ready", "payment_pending"):
            req.status = "cancelled"
            req.cancellation_reason = reason
            req.updated_at = now
            action = "DESIGN_REQUEST_CANCELLED_PRE_EXECUTION"
        else:
            # Post-execution start: requires admin review
            req.cancellation_requested = True
            req.cancellation_reason = reason
            req.updated_at = now
            action = "DESIGN_REQUEST_CANCELLATION_REQUESTED"

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=user.id,
            action=action,
            entity_type="DesignRequest",
            entity_id=req.id,
            details=json.dumps({"reason": reason, "status": req.status}),
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
        request_id: str,
    ) -> List[DesignClarification]:
        """DESIGN-API-005: List clarifications."""
        req = cls.get_request(db, user, request_id)
        return (
            db.query(DesignClarification)
            .filter(DesignClarification.request_id == req.id)
            .order_by(DesignClarification.raised_at.asc())
            .all()
        )

    @classmethod
    def respond_clarification(
        cls,
        db: Session,
        user: User,
        request_id: str,
        clarification_id: str,
        text: str,
        attached_file_ids: Optional[List[str]] = None,
    ) -> DesignClarification:
        """DESIGN-API-005: Respond to clarification."""
        req = cls.get_request(db, user, request_id)
        try:
            c_uuid = uuid.UUID(clarification_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="CLARIFICATION_NOT_FOUND",
                message="Clarification not found",
            )

        clarification = db.query(DesignClarification).filter(
            DesignClarification.id == c_uuid,
            DesignClarification.request_id == req.id,
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

        if req.status == "clarification_needed":
            req.status = "under_review"
            req.updated_at = now

        db.commit()
        db.refresh(clarification)
        return clarification

    @classmethod
    def start_manufacturing_draft(
        cls,
        db: Session,
        user: User,
        request_id: str,
    ) -> Dict[str, Any]:
        """DESIGN-API-006: Convenience endpoint returning a DRAFT MFG payload pre-populated with delivered design files.
        INVARIANT: MUST NOT persist or insert a ManufacturingRequest record in the database.
        """
        req = cls.get_request(db, user, request_id)

        # Query delivered team files for this design request
        delivered_files = db.query(ProjectFile).filter(
            ProjectFile.association_type == "design",
            ProjectFile.association_id == req.id,
            ProjectFile.source == "team_deliverable",
            ProjectFile.scan_status == "clean",
        ).all()

        file_ids = [str(f.id) for f in delivered_files]

        return {
            "title": f"Manufacturing - {req.title}",
            "project_overview": f"Production execution derived from completed Design Request: {req.title}\nOverview: {req.project_overview}",
            "prototype_type": "pcb_assembly",
            "quantity": 1,
            "reference_file_ids": file_ids,
            "source_design_request_id": str(req.id),
            "prefill": {
                "title": f"Manufacturing - {req.title}",
                "prototype_type": "pcb_assembly",
                "quantity": 1,
                "reference_file_ids": file_ids,
            },
        }

    # =========================================================================
    # ADMIN ENDPOINTS (ADMIN-DESIGN-API-001..007)
    # =========================================================================

    @classmethod
    def admin_list_queue(
        cls,
        db: Session,
        admin_user: User,
        status: Optional[str] = None,
        design_scope: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[DesignRequest], int]:
        """ADMIN-DESIGN-API-001: Queue view for design requests."""
        cls._check_admin_role(admin_user)
        query = db.query(DesignRequest)
        if status:
            query = query.filter(DesignRequest.status == status.strip().lower())
        if design_scope:
            query = query.filter(DesignRequest.design_scope == design_scope.strip().lower())
        total = query.count()
        requests = (
            query.order_by(DesignRequest.created_at.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return requests, total

    @classmethod
    def admin_get_request(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
    ) -> DesignRequest:
        """ADMIN-DESIGN-API-002: Full detail view for admin."""
        cls._check_admin_role(admin_user)
        try:
            req_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="REQUEST_NOT_FOUND",
                message="Design request not found",
            )
        req = db.query(DesignRequest).filter(DesignRequest.id == req_uuid).first()
        if not req:
            raise APIException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                code="REQUEST_NOT_FOUND",
                message="Design request not found",
            )
        return req

    @classmethod
    def admin_update_status(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
        status: str,
        internal_notes: Optional[str] = None,
    ) -> DesignRequest:
        cls._check_admin_role(admin_user)
        req = cls.admin_get_request(db, admin_user, request_id)
        clean_status = (status or "").strip().lower()
        now = utcnow()
        req.status = clean_status
        if internal_notes:
            req.internal_notes = internal_notes.strip()
        req.updated_at = now
        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="DESIGN_REQUEST_STATUS_UPDATED",
            entity_type="DesignRequest",
            entity_id=req.id,
            details=json.dumps({"status": clean_status}),
            created_at=now,
        )
        db.add(audit)
        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def confirm_requirements(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
        notes: Optional[str] = None,
    ) -> DesignRequest:
        """ADMIN-DESIGN-API-003: Confirm requirements (under_review -> requirements_confirmed)."""
        cls._check_admin_role(admin_user)
        req = cls.admin_get_request(db, admin_user, request_id)

        now = utcnow()
        req.status = "requirements_confirmed"
        if notes:
            req.internal_notes = notes
        req.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="DESIGN_REQUIREMENTS_CONFIRMED",
            entity_type="DesignRequest",
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
        request_id: str,
        question: str,
    ) -> DesignClarification:
        """ADMIN-DESIGN-API-004: Admin raises clarification question."""
        cls._check_admin_role(admin_user)
        req = cls.admin_get_request(db, admin_user, request_id)

        now = utcnow()
        clarification = DesignClarification(
            id=uuid.uuid4(),
            request_id=req.id,
            question=question.strip(),
            raised_by_id=admin_user.id,
            raised_at=now,
            status="awaiting_response",
        )
        db.add(clarification)

        req.status = "clarification_needed"
        req.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="DESIGN_CLARIFICATION_RAISED",
            entity_type="DesignRequest",
            entity_id=req.id,
            details=json.dumps({"question": question[:100]}),
            created_at=now,
        )
        db.add(audit)
        db.commit()
        db.refresh(clarification)
        return clarification

    @classmethod
    def post_status_update(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
        note: str,
    ) -> DesignStatusUpdate:
        """ADMIN-DESIGN-API-005: Admin posts plain-language execution status note."""
        cls._check_admin_role(admin_user)
        req = cls.admin_get_request(db, admin_user, request_id)

        now = utcnow()
        status_update = DesignStatusUpdate(
            id=uuid.uuid4(),
            request_id=req.id,
            author_id=admin_user.id,
            note=note.strip(),
            created_at=now,
        )
        db.add(status_update)

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="DESIGN_STATUS_UPDATE_POSTED",
            entity_type="DesignRequest",
            entity_id=req.id,
            details=json.dumps({"note": note[:100]}),
            created_at=now,
        )
        db.add(audit)
        db.commit()
        db.refresh(status_update)
        return status_update

    @classmethod
    def complete_execution(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
    ) -> DesignRequest:
        """ADMIN-DESIGN-API-006: Complete design execution (in_progress -> completed_execution)."""
        cls._check_admin_role(admin_user)
        req = cls.admin_get_request(db, admin_user, request_id)

        now = utcnow()
        req.status = "completed_execution"
        req.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="DESIGN_EXECUTION_COMPLETED",
            entity_type="DesignRequest",
            entity_id=req.id,
            details=json.dumps({"status": "completed_execution"}),
            created_at=now,
        )
        db.add(audit)
        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def complete_request(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
    ) -> DesignRequest:
        """ADMIN-DESIGN-API-007: Mark design request fully completed."""
        cls._check_admin_role(admin_user)
        req = cls.admin_get_request(db, admin_user, request_id)

        now = utcnow()
        req.status = "completed"
        req.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="DESIGN_REQUEST_COMPLETED",
            entity_type="DesignRequest",
            entity_id=req.id,
            details=json.dumps({"status": "completed"}),
            created_at=now,
        )
        db.add(audit)
        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def resolve_cancellation(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
        decision: str,
        refund_amount: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> DesignRequest:
        """Resolve post-execution cancellation request."""
        cls._check_admin_role(admin_user)
        req = cls.admin_get_request(db, admin_user, request_id)

        clean_dec = decision.strip().lower()
        if clean_dec not in ("approved", "declined", "approve", "decline"):
            raise APIException(status_code=http_status.HTTP_400_BAD_REQUEST, code="INVALID_DECISION", message="decision must be approved or declined")

        now = utcnow()
        is_approve = clean_dec in ("approved", "approve")
        req.cancellation_decision = "approved" if is_approve else "declined"
        req.cancellation_requested = False
        if notes:
            req.cancellation_notes = notes

        if is_approve:
            req.status = "cancelled"
            if refund_amount:
                try:
                    from app.services.catalog import _paise
                    req.cancellation_refund_paise = _paise(refund_amount)
                except Exception:
                    pass

        req.updated_at = now
        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="DESIGN_CANCELLATION_RESOLVED",
            entity_type="DesignRequest",
            entity_id=req.id,
            details=json.dumps({"decision": req.cancellation_decision, "refund_amount": refund_amount}),
            created_at=now,
        )
        db.add(audit)
        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def customer_complete_request(
        cls,
        db: Session,
        user: User,
        request_id: str,
    ) -> DesignRequest:
        req = cls.get_request(db, user, request_id)
        now = utcnow()
        req.status = "completed"
        req.updated_at = now
        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=user.id,
            action="DESIGN_REQUEST_COMPLETED_BY_CUSTOMER",
            entity_type="DesignRequest",
            entity_id=req.id,
            details=json.dumps({"status": "completed"}),
            created_at=now,
        )
        db.add(audit)
        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def resolve_clarification(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
        clarification_id: str,
    ) -> DesignClarification:
        cls._check_admin_role(admin_user)
        req = cls.admin_get_request(db, admin_user, request_id)
        try:
            c_uuid = uuid.UUID(clarification_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="CLARIFICATION_NOT_FOUND", message="Clarification not found")
        clar = db.query(DesignClarification).filter(
            DesignClarification.id == c_uuid,
            DesignClarification.request_id == req.id,
        ).first()
        if not clar:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="CLARIFICATION_NOT_FOUND", message="Clarification not found")
        now = utcnow()
        clar.status = "resolved"
        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="DESIGN_CLARIFICATION_RESOLVED",
            entity_type="DesignClarification",
            entity_id=clar.id,
            details=json.dumps({"request_id": str(req.id)}),
            created_at=now,
        )
        db.add(audit)
        db.commit()
        db.refresh(clar)
        return clar
