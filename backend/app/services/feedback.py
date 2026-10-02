import uuid
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from fastapi import status as http_status

from app.core.exceptions import APIException
from app.models.user import User, AuditEvent, utcnow
from app.models.order import Order
from app.models.feedback import Feedback
from app.services.notification import NotificationService

FEEDBACK_TYPE_PRIORITY = {
    "payment_issue": "critical",
    "bug_report": "high",
    "order_issue": "high",
    "service_issue": "medium",
    "feature_request": "low",
    "ui_ux_suggestion": "low",
    "general_feedback": "low",
    "other": "low",
}

VALID_FEEDBACK_TYPES = set(FEEDBACK_TYPE_PRIORITY.keys())
VALID_PRIORITIES = {"low", "medium", "high", "critical"}
VALID_STATUSES = {"open", "under_review", "resolved", "closed", "wont_fix"}


class FeedbackService:
    @classmethod
    def create_feedback(
        cls,
        db: Session,
        data: Dict[str, Any],
        user: Optional[User] = None,
    ) -> Feedback:
        feedback_type = data.get("feedback_type", "general_feedback")
        if isinstance(feedback_type, str):
            feedback_type = feedback_type.strip().lower()
        if feedback_type not in VALID_FEEDBACK_TYPES:
            raise APIException(
                f"Invalid feedback_type '{feedback_type}'. Must be one of: {', '.join(sorted(VALID_FEEDBACK_TYPES))}",
                code="INVALID_FEEDBACK_TYPE",
                status_code=http_status.HTTP_400_BAD_REQUEST,
            )

        subject = (data.get("subject") or "").strip()
        if not subject or len(subject) < 3:
            raise APIException(
                "Subject is required and must be at least 3 characters",
                code="VALIDATION_ERROR",
                status_code=http_status.HTTP_400_BAD_REQUEST,
            )

        description = (data.get("description") or "").strip()
        if not description or len(description) < 5:
            raise APIException(
                "Description is required and must be at least 5 characters",
                code="VALIDATION_ERROR",
                status_code=http_status.HTTP_400_BAD_REQUEST,
            )

        # Contact info
        guest_name = (data.get("guest_name") or "").strip() or None
        guest_email = (data.get("guest_email") or "").strip().lower() or None
        guest_phone = (data.get("guest_phone") or "").strip() or None

        if not user and not guest_email:
            raise APIException(
                "Email address is required for guest submissions",
                code="EMAIL_REQUIRED",
                status_code=http_status.HTTP_400_BAD_REQUEST,
            )

        # Validate order_id if present
        order_id = data.get("order_id")
        parsed_order_id = None
        if order_id:
            try:
                parsed_order_id = uuid.UUID(str(order_id))
            except Exception:
                raise APIException(
                    "Invalid order_id format",
                    code="INVALID_ORDER_ID",
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                )
            order = db.query(Order).filter(Order.id == parsed_order_id).first()
            if not order:
                raise APIException(
                    f"Referenced order '{order_id}' not found",
                    code="ORDER_NOT_FOUND",
                    status_code=http_status.HTTP_404_NOT_FOUND,
                )
            if user and order.user_id != user.id:
                raise APIException(
                    "Referenced order does not belong to your account",
                    code="FORBIDDEN_ORDER_ACCESS",
                    status_code=http_status.HTTP_403_FORBIDDEN,
                )

        # Priority calculation
        priority = data.get("priority")
        if priority and str(priority).lower() in VALID_PRIORITIES:
            final_priority = str(priority).lower()
        else:
            final_priority = FEEDBACK_TYPE_PRIORITY.get(feedback_type, "medium")

        service_request_type = data.get("service_request_type")
        service_request_id = data.get("service_request_id")
        parsed_service_request_id = None
        if service_request_id:
            try:
                parsed_service_request_id = uuid.UUID(str(service_request_id))
            except Exception:
                pass

        feedback = Feedback(
            user_id=user.id if user else None,
            guest_name=guest_name if not user else user.full_name,
            guest_email=guest_email if not user else user.email,
            guest_phone=guest_phone if not user else user.phone,
            feedback_type=feedback_type,
            priority=final_priority,
            status="open",
            subject=subject,
            description=description,
            page_url=data.get("page_url"),
            browser_info=data.get("browser_info"),
            order_id=parsed_order_id,
            service_request_type=service_request_type,
            service_request_id=parsed_service_request_id,
            screenshot_url=data.get("screenshot_url"),
            created_at=utcnow(),
        )
        db.add(feedback)
        db.commit()
        db.refresh(feedback)

        # Audit or notification
        if user:
            try:
                NotificationService.create_notification(
                    db=db,
                    user_id=user.id,
                    title="Feedback Received",
                    message=f"Thank you for reporting #{str(feedback.id)[:8]} ({feedback.subject}). Our engineering team will review it shortly.",
                    event_type="feedback_received",
                    idempotency_key=f"feedback_recv_{feedback.id}",
                )
            except Exception:
                pass

        return feedback

    @classmethod
    def list_user_feedbacks(
        cls,
        db: Session,
        user: User,
        status: Optional[str] = None,
        feedback_type: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[Dict[str, Any]], dict]:
        """IDOR-safe listing of feedbacks for current user."""
        query = db.query(Feedback).filter(Feedback.user_id == user.id)
        if status and status.lower() != "all":
            query = query.filter(Feedback.status == status.strip().lower())
        if feedback_type and feedback_type.lower() != "all":
            query = query.filter(Feedback.feedback_type == feedback_type.strip().lower())

        query = query.order_by(Feedback.created_at.desc())
        total = query.count()
        feedbacks = query.offset((page - 1) * page_size).limit(page_size).all()

        items = [cls.format_feedback_dict(f, is_admin=False) for f in feedbacks]
        meta = {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if total > 0 else 0,
        }
        return items, meta

    @classmethod
    def get_user_feedback(
        cls,
        db: Session,
        feedback_id: uuid.UUID,
        user: User,
    ) -> Dict[str, Any]:
        """IDOR-safe single feedback detail for customer."""
        feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
        if not feedback:
            raise APIException(
                "Feedback item not found",
                code="NOT_FOUND",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        if feedback.user_id != user.id:
            raise APIException(
                "Access denied to this feedback record",
                code="FORBIDDEN",
                status_code=http_status.HTTP_403_FORBIDDEN,
            )
        return cls.format_feedback_dict(feedback, is_admin=False)

    @classmethod
    def admin_list_feedbacks(
        cls,
        db: Session,
        status: Optional[str] = None,
        feedback_type: Optional[str] = None,
        priority: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[Dict[str, Any]], dict]:
        query = db.query(Feedback)
        if status and status.lower() != "all":
            query = query.filter(Feedback.status == status.strip().lower())
        if feedback_type and feedback_type.lower() != "all":
            query = query.filter(Feedback.feedback_type == feedback_type.strip().lower())
        if priority and priority.lower() != "all":
            query = query.filter(Feedback.priority == priority.strip().lower())
        if search:
            s = f"%{search.strip().lower()}%"
            query = query.filter(
                or_(
                    func.lower(Feedback.subject).like(s),
                    func.lower(Feedback.description).like(s),
                    func.lower(Feedback.guest_email).like(s),
                    func.lower(Feedback.guest_name).like(s),
                )
            )

        query = query.order_by(Feedback.created_at.desc())
        total = query.count()
        feedbacks = query.offset((page - 1) * page_size).limit(page_size).all()

        items = [cls.format_feedback_dict(f, is_admin=True) for f in feedbacks]
        meta = {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": (total + page_size - 1) // page_size if total > 0 else 0,
        }
        return items, meta

    @classmethod
    def admin_get_feedback(
        cls,
        db: Session,
        feedback_id: uuid.UUID,
    ) -> Dict[str, Any]:
        feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
        if not feedback:
            raise APIException(
                "Feedback item not found",
                code="NOT_FOUND",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )
        return cls.format_feedback_dict(feedback, is_admin=True)

    @classmethod
    def admin_update_feedback(
        cls,
        db: Session,
        feedback_id: uuid.UUID,
        data: Dict[str, Any],
        admin_user: User,
    ) -> Dict[str, Any]:
        feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
        if not feedback:
            raise APIException(
                "Feedback item not found",
                code="NOT_FOUND",
                status_code=http_status.HTTP_404_NOT_FOUND,
            )

        # Status update
        new_status = data.get("status")
        if new_status:
            clean_status = str(new_status).strip().lower()
            if clean_status not in VALID_STATUSES:
                raise APIException(
                    f"Invalid status '{new_status}'. Must be one of: {', '.join(sorted(VALID_STATUSES))}",
                    code="INVALID_STATUS",
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                )
            feedback.status = clean_status
            if clean_status in {"resolved", "closed", "wont_fix"}:
                feedback.resolved_by = admin_user.id
                feedback.resolved_at = utcnow()

        # Priority override
        new_priority = data.get("priority")
        if new_priority:
            clean_p = str(new_priority).strip().lower()
            if clean_p in VALID_PRIORITIES:
                feedback.priority = clean_p

        # Notes
        if "admin_notes" in data:
            feedback.admin_notes = data.get("admin_notes")
        if "admin_response" in data:
            feedback.admin_response = data.get("admin_response")

        feedback.updated_at = utcnow()
        db.commit()
        db.refresh(feedback)

        # Audit event
        audit = AuditEvent(
            user_id=admin_user.id,
            action="UPDATE_FEEDBACK",
            entity_type="Feedback",
            entity_id=feedback.id,
            details={
                "status": feedback.status,
                "priority": feedback.priority,
                "admin_response": feedback.admin_response,
            },
        )
        db.add(audit)
        db.commit()

        # Resolution notification
        if feedback.status == "resolved" and feedback.user_id:
            try:
                NotificationService.create_notification(
                    db=db,
                    user_id=feedback.user_id,
                    title="Feedback Resolved",
                    message=f"Your feedback #{str(feedback.id)[:8]} ({feedback.subject}) has been resolved. {feedback.admin_response or ''}".strip(),
                    event_type="feedback_resolved",
                    idempotency_key=f"feedback_res_{feedback.id}_{feedback.resolved_at.isoformat() if feedback.resolved_at else ''}",
                )
            except Exception:
                pass

        return cls.format_feedback_dict(feedback, is_admin=True)

    @classmethod
    def admin_get_stats(cls, db: Session) -> Dict[str, Any]:
        """Aggregate stats for feedback triage dashboard."""
        total = db.query(Feedback).count()
        open_count = db.query(Feedback).filter(Feedback.status == "open").count()
        under_review_count = db.query(Feedback).filter(Feedback.status == "under_review").count()
        resolved_count = db.query(Feedback).filter(Feedback.status == "resolved").count()
        closed_count = db.query(Feedback).filter(Feedback.status.in_(["closed", "wont_fix"])).count()

        critical_count = db.query(Feedback).filter(
            Feedback.priority == "critical",
            Feedback.status.in_(["open", "under_review"]),
        ).count()
        high_count = db.query(Feedback).filter(
            Feedback.priority == "high",
            Feedback.status.in_(["open", "under_review"]),
        ).count()

        # Count by type
        types_breakdown = {}
        type_rows = db.query(Feedback.feedback_type, func.count(Feedback.id)).group_by(Feedback.feedback_type).all()
        for t_name, count in type_rows:
            types_breakdown[t_name] = count

        return {
            "total": total,
            "open": open_count,
            "under_review": under_review_count,
            "resolved": resolved_count,
            "closed": closed_count,
            "critical_pending": critical_count,
            "high_pending": high_count,
            "by_type": types_breakdown,
        }

    @classmethod
    def format_feedback_dict(cls, f: Feedback, is_admin: bool = False) -> Dict[str, Any]:
        d = {
            "id": str(f.id),
            "feedback_type": f.feedback_type,
            "priority": f.priority,
            "status": f.status,
            "subject": f.subject,
            "description": f.description,
            "page_url": f.page_url,
            "order_id": str(f.order_id) if f.order_id else None,
            "service_request_type": f.service_request_type,
            "service_request_id": str(f.service_request_id) if f.service_request_id else None,
            "screenshot_url": f.screenshot_url,
            "admin_response": f.admin_response,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "updated_at": f.updated_at.isoformat() if f.updated_at else None,
            "resolved_at": f.resolved_at.isoformat() if f.resolved_at else None,
        }
        if is_admin:
            d["user_id"] = str(f.user_id) if f.user_id else None
            d["guest_name"] = f.guest_name
            d["guest_email"] = f.guest_email
            d["guest_phone"] = f.guest_phone
            d["browser_info"] = f.browser_info
            d["admin_notes"] = f.admin_notes
            d["resolved_by"] = str(f.resolved_by) if f.resolved_by else None
            if f.user:
                d["user_full_name"] = f.user.full_name
                d["user_email"] = f.user.email
            if f.resolved_by_user:
                d["resolved_by_name"] = f.resolved_by_user.full_name
        return d
