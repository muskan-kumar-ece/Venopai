import uuid
import json
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from fastapi import status as http_status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.exceptions import APIException
from app.models.user import User, AuditEvent
from app.models.project import (
    Project,
    ProjectFile,
    ManufacturingRequest,
    ManufacturingClarification,
    ManufacturingStatusUpdate,
    Quote,
    QuoteVersion,
)
from app.services.catalog import _rupees, _paise

def utcnow():
    return datetime.now(timezone.utc)

# Concurrency & deduplication caches
_recent_submissions: Dict[str, datetime] = {}


class ManufacturingService:
    """Sections 10, 21, 22, 23, 41, 43: Core Manufacturing lifecycle, state machine, and operational queue."""

    # ----------------------------------------------------------------------
    # Customer Methods
    # ----------------------------------------------------------------------

    @classmethod
    def create_request(
        cls,
        db: Session,
        user: User,
        data: Dict[str, Any],
    ) -> ManufacturingRequest:
        """MFG-API-001: Submit a new manufacturing request with verification and duplicate checks."""
        # 1. Require verified customer (AUTH-001)
        if user.status != "verified" and not getattr(user, "is_verified", False):
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="EMAIL_NOT_VERIFIED",
                message="Email verification required before submitting a manufacturing request",
            )

        # 2. Validate hard-required fields (Doc 03 §24)
        title = data.get("title", "").strip()
        project_overview = data.get("project_overview", "").strip()
        prototype_type = data.get("prototype_type", "").strip()
        quantity = data.get("quantity")

        if not title:
            raise APIException(status_code=http_status.HTTP_400_BAD_REQUEST, code="MISSING_TITLE", message="Title is required")
        if not project_overview:
            raise APIException(status_code=http_status.HTTP_400_BAD_REQUEST, code="MISSING_OVERVIEW", message="Project overview is required")
        if not prototype_type:
            raise APIException(status_code=http_status.HTTP_400_BAD_REQUEST, code="MISSING_PROTOTYPE_TYPE", message="Prototype type is required")
        if not quantity or quantity < 1:
            raise APIException(status_code=http_status.HTTP_400_BAD_REQUEST, code="INVALID_QUANTITY", message="Quantity must be at least 1")

        # 3. Defensive duplicate submission check (Doc 04 §21: 30-second identical payload window)
        now = utcnow()
        payload_key = f"{user.id}_{hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()}"
        last_submit = _recent_submissions.get(payload_key)
        if last_submit and (now - last_submit).total_seconds() < 30:
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="DUPLICATE_SUBMISSION",
                message="An identical manufacturing request was submitted recently. Please wait before re-submitting.",
            )
        _recent_submissions[payload_key] = now

        # 4. Validate project_id if provided
        project_id = None
        if data.get("project_id"):
            try:
                p_uuid = uuid.UUID(data["project_id"])
                proj = db.query(Project).filter(Project.id == p_uuid, Project.user_id == user.id).first()
                if not proj:
                    raise APIException(
                        status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                        code="PROJECT_NOT_FOUND",
                        message="Referenced project does not exist or is not owned by caller",
                    )
                project_id = proj.id
            except ValueError:
                raise APIException(status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY, code="INVALID_PROJECT_ID", message="Invalid project ID")

        # 5. Validate file_ids (FILE-002: pre-uploaded, owned by caller, not associated elsewhere)
        file_ids = data.get("file_ids", [])
        validated_files: List[ProjectFile] = []
        if file_ids:
            for fid in file_ids:
                try:
                    f_uuid = uuid.UUID(fid)
                except ValueError:
                    raise APIException(status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY, code="INVALID_FILE_ID", message=f"Invalid file ID: {fid}")
                
                pf = db.query(ProjectFile).filter(ProjectFile.id == f_uuid).first()
                if not pf or pf.owner_id != user.id:
                    raise APIException(
                        status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                        code="FILE_OWNERSHIP_ERROR",
                        message=f"File {fid} does not belong to the caller",
                    )
                if pf.association_id is not None:
                    raise APIException(
                        status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                        code="FILE_ALREADY_ASSOCIATED",
                        message=f"File {fid} is already associated with another request",
                    )
                validated_files.append(pf)

        # 6. Dimensions formatting
        dimensions = data.get("dimensions")
        dim_str = json.dumps(dimensions) if isinstance(dimensions, dict) else (str(dimensions) if dimensions else None)

        # 7. Create ManufacturingRequest
        req_id = uuid.uuid4()
        mfg_req = ManufacturingRequest(
            id=req_id,
            user_id=user.id,
            project_id=project_id,
            title=title,
            project_overview=project_overview,
            prototype_type=prototype_type,
            quantity=quantity,
            technical_requirements=data.get("technical_requirements"),
            dimensions=dim_str,
            materials=data.get("materials"),
            pcb_hardware_details=data.get("pcb_hardware_details"),
            manufacturing_requirements=data.get("manufacturing_requirements"),
            delivery_requirements=data.get("delivery_requirements"),
            additional_notes=data.get("additional_notes"),
            status="submitted",
            created_at=now,
        )
        db.add(mfg_req)

        # 8. Associate validated files
        for pf in validated_files:
            pf.association_type = "manufacturing"
            pf.association_id = mfg_req.id
            if project_id:
                pf.project_id = project_id

        # 9. Audit event
        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=user.id,
            action="MANUFACTURING_REQUEST_SUBMITTED",
            entity_type="ManufacturingRequest",
            entity_id=mfg_req.id,
            details=json.dumps({"title": title, "quantity": quantity, "prototype_type": prototype_type}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(mfg_req)
        return mfg_req

    @classmethod
    def get_request_detail(
        cls,
        db: Session,
        user: User,
        request_id: str,
    ) -> Tuple[ManufacturingRequest, Dict[str, List[Dict[str, Any]]], Optional[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """MFG-API-003: Get full request detail with IDOR protection (404 for non-owners)."""
        try:
            r_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        is_admin = getattr(user, "is_superuser", False) or getattr(user, "role", "") in ("SUPER_ADMIN", "MANUFACTURING_MANAGER")

        query = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == r_uuid)
        if not is_admin:
            query = query.filter(ManufacturingRequest.user_id == user.id)

        req = query.first()
        if not req:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        # Files grouped by customer_uploaded vs delivered (Doc 03 §23 / §29)
        files_db = db.query(ProjectFile).filter(
            ProjectFile.association_id == req.id,
            ProjectFile.association_type == "manufacturing",
        ).all()

        files_grouped = {"customer_uploaded": [], "delivered": []}
        for f in files_db:
            group = "delivered" if f.source == "team_deliverable" else "customer_uploaded"
            files_grouped[group].append({
                "id": str(f.id),
                "filename": f.filename,
                "content_type": f.content_type,
                "size_bytes": f.size_bytes,
                "scan_status": f.scan_status,
                "source": f.source,
                "created_at": f.created_at.isoformat() if f.created_at else "",
            })

        # Latest quote summary if any
        current_quote = None
        quote = db.query(Quote).filter(Quote.request_id == req.id).first()
        if quote:
            latest_v = (
                db.query(QuoteVersion)
                .filter(QuoteVersion.quote_id == quote.id)
                .order_by(QuoteVersion.version.desc())
                .first()
            )
            if latest_v:
                line_items_parsed = json.loads(latest_v.line_items) if latest_v.line_items else []
                current_quote = {
                    "id": str(quote.id),
                    "version_number": latest_v.version,
                    "status": latest_v.status,
                    "scope_summary": latest_v.scope_summary,
                    "line_items": line_items_parsed,
                    "subtotal": _rupees(latest_v.subtotal_paise),
                    "subtotal_paise": latest_v.subtotal_paise,
                    "tax": {
                        "type": latest_v.tax_type or "GST",
                        "amount": _rupees(latest_v.tax_paise),
                        "amount_paise": latest_v.tax_paise,
                    },
                    "shipping_amount": _rupees(latest_v.shipping_amount_paise),
                    "shipping_amount_paise": latest_v.shipping_amount_paise,
                    "total": _rupees(latest_v.total_amount),
                    "total_paise": latest_v.total_amount,
                    "estimated_timeline": latest_v.estimated_timeline,
                    "valid_until": latest_v.valid_until.isoformat() if latest_v.valid_until else None,
                    "terms": latest_v.terms,
                    "created_at": latest_v.created_at.isoformat() if latest_v.created_at else "",
                }

        # Clarifications
        clarifications_res = []
        for c in req.clarifications:
            resp_dict = None
            if c.response_text:
                resp_dict = {
                    "text": c.response_text,
                    "responded_at": c.responded_at.isoformat() if c.responded_at else None,
                    "attached_file_ids": json.loads(c.attached_file_ids) if c.attached_file_ids else [],
                }
            clarifications_res.append({
                "id": str(c.id),
                "question": c.question,
                "raised_by": "admin",
                "raised_at": c.raised_at.isoformat() if c.raised_at else "",
                "status": c.status,
                "response": resp_dict,
            })

        # Status updates
        status_updates_res = []
        for su in req.status_updates:
            status_updates_res.append({
                "id": str(su.id),
                "note": su.note,
                "author": su.author.full_name or "Engineer",
                "created_at": su.created_at.isoformat() if su.created_at else "",
            })

        return req, files_grouped, current_quote, clarifications_res, status_updates_res

    @classmethod
    def list_requests(
        cls,
        db: Session,
        user: User,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """MFG-API-002: List the customer's own manufacturing requests."""
        query = db.query(ManufacturingRequest).filter(ManufacturingRequest.user_id == user.id)
        total = query.count()
        reqs = query.order_by(ManufacturingRequest.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

        results = []
        for r in reqs:
            open_clarifications = db.query(func.count(ManufacturingClarification.id)).filter(
                ManufacturingClarification.request_id == r.id,
                ManufacturingClarification.status == "awaiting_response",
            ).scalar() or 0

            results.append({
                "id": str(r.id),
                "title": r.title,
                "prototype_type": r.prototype_type,
                "quantity": r.quantity,
                "status": r.status,
                "cancellation_requested": r.cancellation_requested,
                "project_id": str(r.project_id) if r.project_id else None,
                "open_clarifications_count": open_clarifications,
                "created_at": r.created_at.isoformat() if r.created_at else "",
                "updated_at": r.updated_at.isoformat() if r.updated_at else "",
            })

        pagination = {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if total > 0 else 1,
        }
        return results, pagination

    @classmethod
    def cancel_request(
        cls,
        db: Session,
        user: User,
        request_id: str,
        reason: Optional[str] = None,
    ) -> ManufacturingRequest:
        """MFG-API-004: Cancel manufacturing request according to stage-dependent rules (MFG-004/005/006)."""
        try:
            r_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        req = db.query(ManufacturingRequest).filter(
            ManufacturingRequest.id == r_uuid,
            ManufacturingRequest.user_id == user.id,
        ).with_for_update().first()

        if not req:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        if req.status in ("completed", "cancelled"):
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="TERMINAL_STATE",
                message=f"Request is already in terminal state '{req.status}'",
            )

        now = utcnow()

        # Pre-payment stages: instant cancellation (MFG-004)
        pre_payment_stages = {"submitted", "under_review", "clarification_needed", "requirements_confirmed", "quote_ready"}
        if req.status in pre_payment_stages:
            req.status = "cancelled"
            req.cancellation_reason = reason
            req.updated_at = now

            audit = AuditEvent(
                id=uuid.uuid4(),
                user_id=user.id,
                action="MANUFACTURING_CANCELLED_PRE_PAYMENT",
                entity_type="ManufacturingRequest",
                entity_id=req.id,
                details=json.dumps({"reason": reason, "previous_status": req.status}),
                created_at=now,
            )
            db.add(audit)

        # Post-payment pre-execution stages: instant cancel, flag refund workflow (MFG-005)
        elif req.status == "payment_pending":
            req.status = "cancelled"
            req.cancellation_reason = reason
            req.updated_at = now

            audit = AuditEvent(
                id=uuid.uuid4(),
                user_id=user.id,
                action="MANUFACTURING_CANCELLED_REFUND_TRIGGERED",
                entity_type="ManufacturingRequest",
                entity_id=req.id,
                details=json.dumps({"reason": reason, "refund_workflow_triggered": True}),
                created_at=now,
            )
            db.add(audit)

        # In-execution or later stages: Route to admin review queue (MFG-006)
        else:
            req.cancellation_requested = True
            req.cancellation_reason = reason
            req.updated_at = now

            audit = AuditEvent(
                id=uuid.uuid4(),
                user_id=user.id,
                action="MANUFACTURING_CANCELLATION_REVIEW_REQUESTED",
                entity_type="ManufacturingRequest",
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
    ) -> List[Dict[str, Any]]:
        """MFG-API-005: List clarification questions & responses for a request."""
        try:
            r_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        is_admin = getattr(user, "is_superuser", False) or getattr(user, "role", "") in ("SUPER_ADMIN", "MANUFACTURING_MANAGER")
        query = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == r_uuid)
        if not is_admin:
            query = query.filter(ManufacturingRequest.user_id == user.id)

        req = query.first()
        if not req:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        clarifications = db.query(ManufacturingClarification).filter(
            ManufacturingClarification.request_id == req.id
        ).order_by(ManufacturingClarification.raised_at.asc()).all()

        results = []
        for c in clarifications:
            resp_dict = None
            if c.response_text:
                resp_dict = {
                    "text": c.response_text,
                    "responded_at": c.responded_at.isoformat() if c.responded_at else None,
                    "attached_file_ids": json.loads(c.attached_file_ids) if c.attached_file_ids else [],
                }
            results.append({
                "id": str(c.id),
                "question": c.question,
                "raised_by": "admin",
                "raised_at": c.raised_at.isoformat() if c.raised_at else "",
                "status": c.status,
                "response": resp_dict,
            })
        return results

    @classmethod
    def respond_to_clarification(
        cls,
        db: Session,
        user: User,
        request_id: str,
        clarification_id: str,
        text: str,
        attached_file_ids: Optional[List[str]] = None,
    ) -> ManufacturingClarification:
        """MFG-API-006: Customer answers an open clarification question."""
        try:
            r_uuid = uuid.UUID(request_id)
            c_uuid = uuid.UUID(clarification_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="NOT_FOUND", message="Request or clarification not found")

        req = db.query(ManufacturingRequest).filter(
            ManufacturingRequest.id == r_uuid,
            ManufacturingRequest.user_id == user.id,
        ).first()
        if not req:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        clarification = db.query(ManufacturingClarification).filter(
            ManufacturingClarification.id == c_uuid,
            ManufacturingClarification.request_id == req.id,
        ).with_for_update().first()

        if not clarification:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="CLARIFICATION_NOT_FOUND", message="Clarification item not found")

        if clarification.status == "resolved":
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="ALREADY_RESOLVED",
                message="This clarification question has already been resolved and cannot be answered again",
            )

        clean_text = text.strip()
        if not clean_text:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="EMPTY_RESPONSE",
                message="Clarification response cannot be empty",
            )

        now = utcnow()
        clarification.status = "resolved"
        clarification.response_text = clean_text
        clarification.responded_at = now
        clarification.attached_file_ids = json.dumps(attached_file_ids or [])

        # Check if all open clarifications on this request are now resolved
        remaining_open = db.query(ManufacturingClarification).filter(
            ManufacturingClarification.request_id == req.id,
            ManufacturingClarification.id != clarification.id,
            ManufacturingClarification.status == "awaiting_response",
        ).count()

        if remaining_open == 0 and req.status == "clarification_needed":
            req.status = "under_review"
            req.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=user.id,
            action="CLARIFICATION_ANSWERED",
            entity_type="ManufacturingClarification",
            entity_id=clarification.id,
            details=json.dumps({"request_id": str(req.id), "all_resolved": remaining_open == 0}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(clarification)
        return clarification

    @classmethod
    def get_history(cls, db: Session, user: User, request_id: str) -> List[Dict[str, Any]]:
        """MFG-API-007: Timeline history of the manufacturing request."""
        try:
            r_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        is_admin = getattr(user, "is_superuser", False) or getattr(user, "role", "") in ("SUPER_ADMIN", "MANUFACTURING_MANAGER")
        query = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == r_uuid)
        if not is_admin:
            query = query.filter(ManufacturingRequest.user_id == user.id)

        req = query.first()
        if not req:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        events = []
        # 1. Submission event
        events.append({
            "type": "submitted",
            "title": "Request Submitted",
            "description": f"Manufacturing request '{req.title}' submitted by customer.",
            "timestamp": req.created_at.isoformat() if req.created_at else "",
            "actor": "Customer",
        })

        # 2. Clarifications
        for c in req.clarifications:
            events.append({
                "type": "clarification_raised",
                "title": "Clarification Requested",
                "description": c.question,
                "timestamp": c.raised_at.isoformat() if c.raised_at else "",
                "actor": "VenopAI Engineering",
            })
            if c.responded_at:
                events.append({
                    "type": "clarification_resolved",
                    "title": "Clarification Answered",
                    "description": c.response_text,
                    "timestamp": c.responded_at.isoformat(),
                    "actor": "Customer",
                })

        # 3. Status updates
        for su in req.status_updates:
            events.append({
                "type": "status_note",
                "title": "Execution Progress Note",
                "description": su.note,
                "timestamp": su.created_at.isoformat() if su.created_at else "",
                "actor": su.author.full_name or "Engineer",
            })

        # 4. Quotes
        for q in req.quotes:
            for v in q.versions:
                events.append({
                    "type": f"quote_v{v.version}",
                    "title": f"Quote V{v.version} ({v.status.upper()})",
                    "description": f"Total: {_rupees(v.total_amount)} INR. {v.scope_summary or ''}",
                    "timestamp": v.created_at.isoformat() if v.created_at else "",
                    "actor": "VenopAI Admin",
                })

        # Sort all events chronologically
        events.sort(key=lambda x: x["timestamp"])
        return events

    # ----------------------------------------------------------------------
    # Admin Operations (Scoped to MANUFACTURING_MANAGER / SUPER_ADMIN)
    # ----------------------------------------------------------------------

    @classmethod
    def _verify_admin(cls, admin_user: User) -> None:
        role = getattr(admin_user, "role", "")
        is_su = getattr(admin_user, "is_superuser", False)
        if not is_su and role not in ("SUPER_ADMIN", "MANUFACTURING_MANAGER"):
            raise APIException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                code="INSUFFICIENT_PERMISSIONS",
                message="Manufacturing administration is restricted to SUPER_ADMIN and MANUFACTURING_MANAGER",
            )

    @classmethod
    def admin_list_queue(
        cls,
        db: Session,
        admin_user: User,
        status: Optional[str] = None,
        prototype_type: Optional[str] = None,
        sort_by: str = "created_at",
        order: str = "asc",  # oldest first is the operational default
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """ADMIN-MFG-API-001: Operational queue view sortable by age with actionable signals."""
        cls._verify_admin(admin_user)

        query = db.query(ManufacturingRequest)
        if status:
            query = query.filter(ManufacturingRequest.status == status.strip().lower())
        if prototype_type:
            query = query.filter(ManufacturingRequest.prototype_type == prototype_type.strip().lower())

        total = query.count()

        sort_col = ManufacturingRequest.created_at
        if order.lower() == "desc":
            query = query.order_by(sort_col.desc())
        else:
            query = query.order_by(sort_col.asc())

        items = query.offset((page - 1) * page_size).limit(page_size).all()
        now = utcnow()

        results = []
        for r in items:
            dt = r.updated_at or r.created_at
            if dt:
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                days_in_status = (now - dt).days
            else:
                days_in_status = 0
            open_clars = db.query(func.count(ManufacturingClarification.id)).filter(
                ManufacturingClarification.request_id == r.id,
                ManufacturingClarification.status == "awaiting_response",
            ).scalar() or 0

            results.append({
                "id": str(r.id),
                "title": r.title,
                "prototype_type": r.prototype_type,
                "quantity": r.quantity,
                "status": r.status,
                "cancellation_requested": r.cancellation_requested,
                "project_id": str(r.project_id) if r.project_id else None,
                "open_clarifications_count": open_clars,
                "days_in_current_status": days_in_status,
                "customer_email": r.user.email if r.user else None,
                "created_at": r.created_at.isoformat() if r.created_at else "",
                "updated_at": r.updated_at.isoformat() if r.updated_at else "",
            })

        pagination = {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size if total > 0 else 1,
        }
        return results, pagination

    @classmethod
    def admin_confirm_requirements(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
        notes: Optional[str] = None,
    ) -> ManufacturingRequest:
        """ADMIN-MFG-API-003: Guarded transition under_review -> requirements_confirmed."""
        cls._verify_admin(admin_user)
        try:
            r_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        req = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == r_uuid).with_for_update().first()
        if not req:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        allowed_from = {"submitted", "under_review", "clarification_needed"}
        if req.status not in allowed_from:
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="INVALID_STATE_TRANSITION",
                message=f"Cannot confirm requirements from state '{req.status}'",
            )

        now = utcnow()
        req.status = "requirements_confirmed"
        if notes:
            req.internal_notes = f"{req.internal_notes or ''}\n[Requirements Confirmed: {notes}]".strip()
        req.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="MANUFACTURING_REQUIREMENTS_CONFIRMED",
            entity_type="ManufacturingRequest",
            entity_id=req.id,
            details=json.dumps({"notes": notes}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def admin_raise_clarification(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
        question: str,
    ) -> ManufacturingClarification:
        """ADMIN-MFG-API-004: Raise a new clarification question; transitions request to clarification_needed."""
        cls._verify_admin(admin_user)
        try:
            r_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        req = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == r_uuid).with_for_update().first()
        if not req:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        if req.status in ("completed", "cancelled"):
            raise APIException(status_code=http_status.HTTP_409_CONFLICT, code="REQUEST_TERMINAL", message="Cannot raise clarification on a terminal request")

        clean_q = question.strip()
        if not clean_q:
            raise APIException(status_code=http_status.HTTP_400_BAD_REQUEST, code="EMPTY_QUESTION", message="Clarification question cannot be empty")

        now = utcnow()
        clarification = ManufacturingClarification(
            id=uuid.uuid4(),
            request_id=req.id,
            question=clean_q,
            raised_by_id=admin_user.id,
            raised_at=now,
            status="awaiting_response",
        )
        db.add(clarification)

        # Transition request status to clarification_needed
        req.status = "clarification_needed"
        req.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="CLARIFICATION_RAISED",
            entity_type="ManufacturingClarification",
            entity_id=clarification.id,
            details=json.dumps({"request_id": str(req.id), "question": clean_q}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(clarification)
        return clarification

    @classmethod
    def admin_post_status_update(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
        note: str,
    ) -> ManufacturingStatusUpdate:
        """ADMIN-MFG-API-005: Post a plain-language execution status update note."""
        cls._verify_admin(admin_user)
        try:
            r_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        req = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == r_uuid).first()
        if not req:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        clean_note = note.strip()
        if not clean_note:
            raise APIException(status_code=http_status.HTTP_400_BAD_REQUEST, code="EMPTY_NOTE", message="Status update note cannot be empty")

        now = utcnow()
        su = ManufacturingStatusUpdate(
            id=uuid.uuid4(),
            request_id=req.id,
            author_id=admin_user.id,
            note=clean_note,
            created_at=now,
        )
        db.add(su)

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="MANUFACTURING_STATUS_NOTE_POSTED",
            entity_type="ManufacturingStatusUpdate",
            entity_id=su.id,
            details=json.dumps({"request_id": str(req.id), "note": clean_note}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(su)
        return su

    @classmethod
    def admin_complete_execution(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
    ) -> ManufacturingRequest:
        """ADMIN-MFG-API-006: Guarded transition in_progress -> completed_execution."""
        cls._verify_admin(admin_user)
        try:
            r_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        req = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == r_uuid).with_for_update().first()
        if not req:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        if req.status not in ("in_progress", "IN_PROGRESS"):
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="INVALID_STATE_TRANSITION",
                message=f"Cannot mark execution complete from status '{req.status}'. Must be in_progress.",
            )

        now = utcnow()
        req.status = "completed_execution"
        req.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="MANUFACTURING_EXECUTION_COMPLETED",
            entity_type="ManufacturingRequest",
            entity_id=req.id,
            details=json.dumps({"request_id": str(req.id)}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def admin_complete_request(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
    ) -> ManufacturingRequest:
        """ADMIN-MFG-API-007: Guarded transition delivered -> completed."""
        cls._verify_admin(admin_user)
        try:
            r_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        req = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == r_uuid).with_for_update().first()
        if not req:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        allowed_states = {"delivered", "completed_execution"}
        if req.status not in allowed_states:
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="INVALID_STATE_TRANSITION",
                message=f"Cannot complete request from status '{req.status}'. Must be delivered or completed_execution.",
            )

        now = utcnow()
        req.status = "completed"
        req.updated_at = now

        audit = AuditEvent(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            action="MANUFACTURING_REQUEST_COMPLETED",
            entity_type="ManufacturingRequest",
            entity_id=req.id,
            details=json.dumps({"request_id": str(req.id)}),
            created_at=now,
        )
        db.add(audit)

        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def admin_list_cancellation_queue(
        cls,
        db: Session,
        admin_user: User,
    ) -> List[Dict[str, Any]]:
        """ADMIN-MFG-API-008: List requests flagged with cancellation_requested == True."""
        cls._verify_admin(admin_user)

        items = db.query(ManufacturingRequest).filter(
            ManufacturingRequest.cancellation_requested == True,
        ).order_by(ManufacturingRequest.updated_at.desc()).all()

        results = []
        for r in items:
            results.append({
                "id": str(r.id),
                "title": r.title,
                "prototype_type": r.prototype_type,
                "quantity": r.quantity,
                "status": r.status,
                "cancellation_requested": True,
                "cancellation_reason": r.cancellation_reason,
                "customer_email": r.user.email if r.user else None,
                "created_at": r.created_at.isoformat() if r.created_at else "",
                "updated_at": r.updated_at.isoformat() if r.updated_at else "",
            })
        return results

    @classmethod
    def admin_resolve_cancellation(
        cls,
        db: Session,
        admin_user: User,
        request_id: str,
        decision: str,
        refund_amount: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> ManufacturingRequest:
        """ADMIN-MFG-API-009: Approve (with refund terms) or decline a post-execution cancellation."""
        cls._verify_admin(admin_user)
        try:
            r_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        req = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == r_uuid).with_for_update().first()
        if not req:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        if not req.cancellation_requested:
            raise APIException(
                status_code=http_status.HTTP_409_CONFLICT,
                code="NO_CANCELLATION_REQUESTED",
                message="No cancellation is requested for this request",
            )

        now = utcnow()
        clean_dec = decision.strip().lower()
        if clean_dec in ("approve", "approved"):
            req.status = "cancelled"
            req.cancellation_decision = "approved"
            req.cancellation_requested = False
            req.cancellation_notes = notes
            refund_paise = _paise(refund_amount) if refund_amount else 0
            req.cancellation_refund_paise = refund_paise
            req.updated_at = now

            audit = AuditEvent(
                id=uuid.uuid4(),
                user_id=admin_user.id,
                action="MANUFACTURING_CANCELLATION_APPROVED",
                entity_type="ManufacturingRequest",
                entity_id=req.id,
                details=json.dumps({
                    "decision": "approved",
                    "refund_amount_paise": refund_paise,
                    "refund_workflow_triggered": True,
                    "notes": notes,
                }),
                created_at=now,
            )
            db.add(audit)

        elif clean_dec in ("decline", "declined"):
            req.cancellation_decision = "declined"
            req.cancellation_requested = False
            req.cancellation_notes = notes
            req.updated_at = now

            audit = AuditEvent(
                id=uuid.uuid4(),
                user_id=admin_user.id,
                action="MANUFACTURING_CANCELLATION_DECLINED",
                entity_type="ManufacturingRequest",
                entity_id=req.id,
                details=json.dumps({"decision": "declined", "notes": notes}),
                created_at=now,
            )
            db.add(audit)
        else:
            raise APIException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                code="INVALID_DECISION",
                message="Decision must be 'approve' or 'decline'",
            )

        db.commit()
        db.refresh(req)
        return req

    @classmethod
    def get_history(
        cls,
        db: Session,
        user: User,
        request_id: str,
    ) -> List[Dict[str, Any]]:
        """MFG-API-007: Return status/timeline history for request (IDOR 404 protected)."""
        try:
            r_uuid = uuid.UUID(request_id)
        except ValueError:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        is_admin = getattr(user, "is_superuser", False) or getattr(user, "is_admin", False) or getattr(user, "role", "") in (
            "SUPER_ADMIN", "MANUFACTURING_MANAGER"
        )
        query = db.query(ManufacturingRequest).filter(ManufacturingRequest.id == r_uuid)
        if not is_admin:
            query = query.filter(ManufacturingRequest.user_id == user.id)

        req = query.first()
        if not req:
            raise APIException(status_code=http_status.HTTP_404_NOT_FOUND, code="REQUEST_NOT_FOUND", message="Request not found")

        events = []

        # 1. Submission event
        events.append({
            "type": "status_transition",
            "title": "Request Submitted",
            "description": f"Manufacturing request for {req.prototype_type} (qty: {req.quantity}) submitted.",
            "timestamp": req.created_at.isoformat() if req.created_at else "",
            "actor": "customer",
        })

        # 2. AuditEvents related to this request
        audit_events = (
            db.query(AuditEvent)
            .filter(
                AuditEvent.entity_type == "ManufacturingRequest",
                AuditEvent.entity_id == req.id,
            )
            .order_by(AuditEvent.created_at.asc())
            .all()
        )
        for a in audit_events:
            actor = "admin" if (
                a.action.startswith("MANUFACTURING_REQUIREMENTS")
                or a.action.startswith("CLARIFICATION")
                or a.action.startswith("MANUFACTURING_CANCELLATION_")
                or a.action == "MANUFACTURING_REQUEST_COMPLETED"
                or a.action == "MANUFACTURING_EXECUTION_COMPLETED"
            ) else "customer"
            title = a.action.replace("_", " ").title()
            desc = None
            if a.details:
                try:
                    d = json.loads(a.details)
                    desc = d.get("notes") or d.get("reason") or d.get("question") or str(d)
                except Exception:
                    desc = a.details

            events.append({
                "type": "audit_event",
                "title": title,
                "description": desc,
                "timestamp": a.created_at.isoformat() if a.created_at else "",
                "actor": actor,
            })

        # 3. Status updates posted by team
        status_updates = (
            db.query(ManufacturingStatusUpdate)
            .filter(ManufacturingStatusUpdate.request_id == req.id)
            .order_by(ManufacturingStatusUpdate.created_at.asc())
            .all()
        )
        for su in status_updates:
            author_name = "Engineer"
            if su.author and hasattr(su.author, "full_name") and su.author.full_name:
                author_name = su.author.full_name
            events.append({
                "type": "status_update",
                "title": "Production Milestone",
                "description": su.note,
                "timestamp": su.created_at.isoformat() if su.created_at else "",
                "actor": author_name,
            })

        # Sort all events chronologically
        events.sort(key=lambda x: x["timestamp"] or "")
        return events
