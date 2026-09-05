from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.db.session import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="projects")
    service_requests = relationship("ServiceRequest", back_populates="project")
    files = relationship("File", back_populates="project")

class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    type = Column(String, nullable=False) # e.g. "MANUFACTURING", "DESIGN", "FIRMWARE"
    status = Column(String, default="SUBMITTED", index=True)
    requirements = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="service_requests")
    quotes = relationship("Quote", back_populates="service_request")

class Quote(Base):
    __tablename__ = "quotes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_request_id = Column(UUID(as_uuid=True), ForeignKey("service_requests.id"), nullable=False)
    status = Column(String, default="DRAFT") # DRAFT, ISSUED, ACCEPTED, REJECTED
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    service_request = relationship("ServiceRequest", back_populates="quotes")
    versions = relationship("QuoteVersion", back_populates="quote", cascade="all, delete-orphan")

class QuoteVersion(Base):
    __tablename__ = "quote_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quote_id = Column(UUID(as_uuid=True), ForeignKey("quotes.id"), nullable=False)
    version = Column(Integer, nullable=False)
    total_amount = Column(Integer, nullable=False)
    details = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    quote = relationship("Quote", back_populates="versions")

class File(Base):
    __tablename__ = "files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False)
    s3_key = Column(String, nullable=False)
    visibility = Column(String, default="PRIVATE") # PRIVATE, SHARED
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="files")
