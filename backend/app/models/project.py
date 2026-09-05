import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base

def utcnow():
    return datetime.now(timezone.utc)

class Project(Base):
    __tablename__ = "projects"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="projects")
    files = relationship("ProjectFile", back_populates="project")
    manufacturing_requests = relationship("ManufacturingRequest", back_populates="project")
    consultation_requests = relationship("ConsultationRequest", back_populates="project")
    design_requests = relationship("DesignRequest", back_populates="project")
    software_requests = relationship("SoftwareRequest", back_populates="project")

class ProjectFile(Base):
    __tablename__ = "project_files"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False)
    s3_key = Column(String, nullable=False)
    visibility = Column(String, default="PRIVATE")
    created_at = Column(DateTime(timezone=True), default=utcnow)

    project = relationship("Project", back_populates="files")

class ManufacturingRequest(Base):
    __tablename__ = "manufacturing_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    status = Column(String, default="SUBMITTED", index=True)
    requirements = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    project = relationship("Project", back_populates="manufacturing_requests")

class ConsultationRequest(Base):
    __tablename__ = "consultation_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    status = Column(String, default="SUBMITTED", index=True)
    requirements = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    project = relationship("Project", back_populates="consultation_requests")

class DesignRequest(Base):
    __tablename__ = "design_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    status = Column(String, default="SUBMITTED", index=True)
    requirements = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    project = relationship("Project", back_populates="design_requests")

class SoftwareRequest(Base):
    __tablename__ = "software_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    status = Column(String, default="SUBMITTED", index=True)
    requirements = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    project = relationship("Project", back_populates="software_requests")

class Quote(Base):
    __tablename__ = "quotes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    status = Column(String, default="DRAFT")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    project = relationship("Project")
    versions = relationship("QuoteVersion", back_populates="quote", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="quote")

class QuoteVersion(Base):
    __tablename__ = "quote_versions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quote_id = Column(UUID(as_uuid=True), ForeignKey("quotes.id"), nullable=False)
    version = Column(Integer, nullable=False)
    total_amount = Column(Integer, nullable=False)
    details = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    quote = relationship("Quote", back_populates="versions")
    approval = relationship("QuoteApproval", back_populates="quote_version", uselist=False)

class QuoteApproval(Base):
    __tablename__ = "quote_approvals"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quote_version_id = Column(UUID(as_uuid=True), ForeignKey("quote_versions.id"), nullable=False, unique=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(String, default="APPROVED")
    created_at = Column(DateTime(timezone=True), default=utcnow)

    quote_version = relationship("QuoteVersion", back_populates="approval")
