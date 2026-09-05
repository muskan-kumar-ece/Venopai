import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base

def utcnow():
    return datetime.now(timezone.utc)

class Project(Base):
    __tablename__ = "projects"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="projects")
    files = relationship("ProjectFile", back_populates="project")
    manufacturing_requests = relationship("ManufacturingRequest", back_populates="project")
    consultation_requests = relationship("ConsultationRequest", back_populates="project")
    design_requests = relationship("DesignRequest", back_populates="project")
    software_requests = relationship("SoftwareRequest", back_populates="project")
    quotes = relationship("Quote", back_populates="project")


class ProjectFile(Base):
    """Section 16 & Section 29: Private Project/Request File storage and metadata."""
    __tablename__ = "project_files"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True)
    filename = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=False, default="application/octet-stream")
    size_bytes = Column(Integer, nullable=False, default=0)
    storage_ref = Column(String(500), nullable=False)
    scan_status = Column(String(50), default="clean", nullable=False)  # pending_scan, clean, flagged
    source = Column(String(50), default="customer_upload", nullable=False)  # customer_upload, team_deliverable
    association_type = Column(String(50), nullable=True, default="manufacturing")  # manufacturing, design, consultation, software
    association_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    visibility = Column(String(50), default="PRIVATE")
    created_at = Column(DateTime(timezone=True), default=utcnow)

    owner = relationship("User", foreign_keys=[owner_id])
    project = relationship("Project", back_populates="files")


class ManufacturingRequest(Base):
    """Sections 10, 21-23: Core Manufacturing Request entity."""
    __tablename__ = "manufacturing_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True)
    
    title = Column(String(255), nullable=False)
    project_overview = Column(Text, nullable=False)
    prototype_type = Column(String(100), nullable=False, default="pcb_assembly")
    quantity = Column(Integer, nullable=False, default=1)
    
    technical_requirements = Column(Text, nullable=True)
    dimensions = Column(Text, nullable=True)  # JSON or text L x W x H
    materials = Column(Text, nullable=True)
    pcb_hardware_details = Column(Text, nullable=True)
    manufacturing_requirements = Column(Text, nullable=True)
    delivery_requirements = Column(Text, nullable=True)
    additional_notes = Column(Text, nullable=True)
    
    status = Column(String(50), default="submitted", index=True, nullable=False)
    
    cancellation_requested = Column(Boolean, default=False, nullable=False)
    cancellation_reason = Column(Text, nullable=True)
    cancellation_decision = Column(String(50), nullable=True)  # approve, decline
    cancellation_refund_paise = Column(Integer, nullable=True)
    cancellation_notes = Column(Text, nullable=True)
    internal_notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User")
    project = relationship("Project", back_populates="manufacturing_requests")
    clarifications = relationship("ManufacturingClarification", back_populates="manufacturing_request", cascade="all, delete-orphan", order_by="ManufacturingClarification.raised_at.asc()")
    status_updates = relationship("ManufacturingStatusUpdate", back_populates="manufacturing_request", cascade="all, delete-orphan", order_by="ManufacturingStatusUpdate.created_at.asc()")
    quotes = relationship("Quote", back_populates="manufacturing_request", foreign_keys="[Quote.request_id]")


class ManufacturingClarification(Base):
    """Section 23: Structured, asynchronous clarification Q&A item."""
    __tablename__ = "manufacturing_clarifications"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(UUID(as_uuid=True), ForeignKey("manufacturing_requests.id"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    raised_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    raised_at = Column(DateTime(timezone=True), default=utcnow)
    status = Column(String(50), default="awaiting_response", nullable=False)  # awaiting_response, resolved
    response_text = Column(Text, nullable=True)
    responded_at = Column(DateTime(timezone=True), nullable=True)
    attached_file_ids = Column(Text, nullable=True)  # JSON serialized list of file UUID strings

    manufacturing_request = relationship("ManufacturingRequest", back_populates="clarifications")
    raised_by = relationship("User", foreign_keys=[raised_by_id])


class ManufacturingStatusUpdate(Base):
    """Section 41 & Section 43: Plain-language execution progress update."""
    __tablename__ = "manufacturing_status_updates"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(UUID(as_uuid=True), ForeignKey("manufacturing_requests.id"), nullable=False, index=True)
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    note = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    manufacturing_request = relationship("ManufacturingRequest", back_populates="status_updates")
    author = relationship("User", foreign_keys=[author_id])


class ConsultationRequest(Base):
    __tablename__ = "consultation_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    status = Column(String, default="SUBMITTED", index=True)
    requirements = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    project = relationship("Project", back_populates="consultation_requests")


class DesignRequest(Base):
    __tablename__ = "design_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    status = Column(String, default="SUBMITTED", index=True)
    requirements = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    project = relationship("Project", back_populates="design_requests")


class SoftwareRequest(Base):
    __tablename__ = "software_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    status = Column(String, default="SUBMITTED", index=True)
    requirements = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    project = relationship("Project", back_populates="software_requests")


class Quote(Base):
    """Section 11, 32, 44: Shared service quotation model."""
    __tablename__ = "quotes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True)
    request_type = Column(String(50), default="manufacturing", nullable=False)
    request_id = Column(UUID(as_uuid=True), ForeignKey("manufacturing_requests.id"), nullable=True, index=True)
    status = Column(String(50), default="draft", nullable=False)  # draft, sent, viewed, approved, rejected, expired, superseded, cancelled
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User")
    project = relationship("Project", back_populates="quotes")
    manufacturing_request = relationship("ManufacturingRequest", back_populates="quotes")
    versions = relationship("QuoteVersion", back_populates="quote", cascade="all, delete-orphan", order_by="QuoteVersion.version.asc()")
    payments = relationship("Payment", back_populates="quote")


class QuoteVersion(Base):
    """Section 33: Immutable quotation iteration."""
    __tablename__ = "quote_versions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quote_id = Column(UUID(as_uuid=True), ForeignKey("quotes.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    status = Column(String(50), default="draft", nullable=False)  # draft, sent, viewed, approved, rejected, expired, superseded
    scope_summary = Column(Text, nullable=True)
    line_items = Column(Text, nullable=True)  # JSON serialized list of line items
    subtotal_paise = Column(Integer, nullable=False, default=0)
    tax_paise = Column(Integer, nullable=False, default=0)
    tax_type = Column(String(50), nullable=True)
    shipping_amount_paise = Column(Integer, nullable=False, default=0)
    total_amount = Column(Integer, nullable=False, default=0)  # total in paise
    estimated_timeline = Column(String(255), nullable=True)
    valid_until = Column(DateTime(timezone=True), nullable=True)
    terms = Column(Text, nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    quote = relationship("Quote", back_populates="versions")
    approval = relationship("QuoteApproval", back_populates="quote_version", uselist=False)


class QuoteApproval(Base):
    """Section 32: Explicit customer quote approval/rejection record."""
    __tablename__ = "quote_approvals"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quote_version_id = Column(UUID(as_uuid=True), ForeignKey("quote_versions.id"), nullable=False, unique=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(String(50), default="APPROVED", nullable=False)  # APPROVED, REJECTED
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    quote_version = relationship("QuoteVersion", back_populates="approval")
    user = relationship("User")
