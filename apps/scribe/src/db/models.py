"""SQLAlchemy models mirroring the TypeORM entities in packages/database/.

These models are the Python-side representation of the shared database schema.
The source of truth for migrations lives in the gate app (TypeORM).

Column names use the exact camelCase names that TypeORM generates in PostgreSQL
(e.g. "documentId", "chunkIndex") so the mapping stays 1-to-1.

UUID columns use as_uuid=False so Python sees plain strings — consistent
with how all repositories and services pass IDs around.

Each column that has a server_default (PostgreSQL) also carries a Python-side
default so the ORM can fill values when the DB engine doesn't support the
default expression (e.g. SQLite in tests).
"""

from __future__ import annotations

import datetime
import uuid as _uuid
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base

# "metadata" is reserved by DeclarativeBase; we map those columns under
# a different Python name (*_metadata) while keeping the DB column as "metadata".

PK_UUID = UUID(as_uuid=False)
FK_UUID = UUID(as_uuid=False)


def _new_uuid() -> str:
    return str(_uuid.uuid4())


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        PK_UUID, primary_key=True, default=_new_uuid, server_default=text("gen_random_uuid()")
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    firstName: Mapped[str] = mapped_column("firstName", String, nullable=False)
    lastName: Mapped[str] = mapped_column("lastName", String, nullable=False)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    profilePicture: Mapped[str | None] = mapped_column("profilePicture", String, nullable=True)
    pushToken: Mapped[str | None] = mapped_column("pushToken", String, nullable=True)
    storageUsed: Mapped[int] = mapped_column(
        "storageUsed", BigInteger, default=0, server_default=text("0")
    )
    storageLimit: Mapped[int] = mapped_column("storageLimit", BigInteger)
    extraStorage: Mapped[int] = mapped_column(
        "extraStorage", BigInteger, default=0, server_default=text("0")
    )
    preferences: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    searchCount: Mapped[int] = mapped_column(
        "searchCount", Integer, default=0, server_default=text("0")
    )
    address: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    role: Mapped[str] = mapped_column(String, default="USER", server_default=text("'USER'"))
    refreshToken: Mapped[str | None] = mapped_column("refreshToken", String, nullable=True)
    provider: Mapped[str] = mapped_column(String, nullable=False)
    lastLoginAt: Mapped[datetime.datetime | None] = mapped_column(
        "lastLoginAt", DateTime(timezone=True), nullable=True
    )
    otpHash: Mapped[str | None] = mapped_column("otpHash", String, nullable=True)
    otpExpiresAt: Mapped[datetime.datetime | None] = mapped_column(
        "otpExpiresAt", DateTime(timezone=True), nullable=True
    )
    isOnboarded: Mapped[bool] = mapped_column(
        "isOnboarded", Boolean, default=False, server_default=text("false")
    )
    subscriptionTier: Mapped[str] = mapped_column(
        "subscriptionTier", String, default="FREE", server_default=text("'FREE'")
    )
    credits: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    dailySearchUsed: Mapped[int] = mapped_column(
        "dailySearchUsed", Integer, default=0, server_default=text("0")
    )
    dailySearchResetAt: Mapped[datetime.datetime] = mapped_column(
        "dailySearchResetAt", DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
    bonusSearches: Mapped[int] = mapped_column(
        "bonusSearches", Integer, default=0, server_default=text("0")
    )
    createdAt: Mapped[datetime.datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
    updatedAt: Mapped[datetime.datetime] = mapped_column(
        "updatedAt",
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        onupdate=func.now(),
    )

    documents: Mapped[list[Document]] = relationship(back_populates="user")
    categories: Mapped[list[Category]] = relationship(back_populates="user")
    tags: Mapped[list[Tag]] = relationship(back_populates="user")
    notifications: Mapped[list[Notification]] = relationship(back_populates="user")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(
        PK_UUID, primary_key=True, default=_new_uuid, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    icon: Mapped[str] = mapped_column(
        String, default="folder-outline", server_default=text("'folder-outline'")
    )
    color: Mapped[str] = mapped_column(String, default="#4F46E5", server_default=text("'#4F46E5'"))
    order: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    isSystemDefault: Mapped[bool] = mapped_column(
        "isSystemDefault", Boolean, default=True, server_default=text("true")
    )
    parentId: Mapped[str | None] = mapped_column(
        "parentId",
        FK_UUID,
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    userId: Mapped[str | None] = mapped_column(
        "userId", FK_UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    createdAt: Mapped[datetime.datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
    updatedAt: Mapped[datetime.datetime] = mapped_column(
        "updatedAt",
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[User | None] = relationship(back_populates="categories")
    parent: Mapped[Category | None] = relationship(
        remote_side=[id],
        back_populates="children",
        foreign_keys=[parentId],
    )
    children: Mapped[list[Category]] = relationship(back_populates="parent")
    documents: Mapped[list[Document]] = relationship(back_populates="category")


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(
        PK_UUID, primary_key=True, default=_new_uuid, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    color: Mapped[str] = mapped_column(String, default="#94A3B8", server_default=text("'#94A3B8'"))
    order: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    isSystemDefault: Mapped[bool] = mapped_column(
        "isSystemDefault", Boolean, default=True, server_default=text("true")
    )
    userId: Mapped[str | None] = mapped_column(
        "userId", FK_UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    createdAt: Mapped[datetime.datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
    updatedAt: Mapped[datetime.datetime] = mapped_column(
        "updatedAt",
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[User | None] = relationship(back_populates="tags")
    documents: Mapped[list[Document]] = relationship(
        secondary="document_tags", back_populates="tags"
    )


class DocumentTag(Base):
    """Join table for the many-to-many between documents and tags."""

    __tablename__ = "document_tags"

    documentId: Mapped[str] = mapped_column(
        "documentId",
        FK_UUID,
        ForeignKey("documents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tagId: Mapped[str] = mapped_column(
        "tagId",
        FK_UUID,
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(
        PK_UUID, primary_key=True, default=_new_uuid, server_default=text("gen_random_uuid()")
    )
    filename: Mapped[str] = mapped_column(String, nullable=False)
    originalName: Mapped[str] = mapped_column("originalName", String, nullable=False)
    mimetype: Mapped[str] = mapped_column(String, nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    path: Mapped[str] = mapped_column(String, nullable=False)
    thumbnailPath: Mapped[str | None] = mapped_column("thumbnailPath", String, nullable=True)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)
    doc_metadata: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    isProcessed: Mapped[bool] = mapped_column(
        "isProcessed", Boolean, default=False, server_default=text("false")
    )
    processingStatus: Mapped[str] = mapped_column(
        "processingStatus", String, default="PENDING", server_default=text("'PENDING'")
    )
    classificationSource: Mapped[str] = mapped_column(
        "classificationSource", String, default="AI", server_default=text("'AI'")
    )
    createdAt: Mapped[datetime.datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
    updatedAt: Mapped[datetime.datetime] = mapped_column(
        "updatedAt",
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deletedAt: Mapped[datetime.datetime | None] = mapped_column(
        "deletedAt", DateTime(timezone=True), nullable=True
    )

    userId: Mapped[str] = mapped_column(
        "userId", FK_UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    categoryId: Mapped[str | None] = mapped_column(
        "categoryId",
        FK_UUID,
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
    )

    user: Mapped[User] = relationship(back_populates="documents")
    category: Mapped[Category | None] = relationship(back_populates="documents")
    tags: Mapped[list[Tag]] = relationship(secondary="document_tags", back_populates="documents")
    chunks: Mapped[list[DocumentChunk]] = relationship(back_populates="document")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = (
        UniqueConstraint("documentId", "chunkIndex", name="UQ_document_chunks_document_chunk"),
        Index("idx_document_chunks_user", "userId"),
        Index("idx_document_chunks_document", "documentId"),
    )

    id: Mapped[str] = mapped_column(
        PK_UUID, primary_key=True, default=_new_uuid, server_default=text("gen_random_uuid()")
    )
    documentId: Mapped[str] = mapped_column(
        "documentId",
        FK_UUID,
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    userId: Mapped[str] = mapped_column(
        "userId",
        FK_UUID,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    chunkIndex: Mapped[int] = mapped_column("chunkIndex", Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    contentHash: Mapped[str] = mapped_column("contentHash", String, nullable=False)
    tokenCount: Mapped[int] = mapped_column("tokenCount", Integer, nullable=False)
    startOffset: Mapped[int] = mapped_column("startOffset", Integer, nullable=False)
    endOffset: Mapped[int] = mapped_column("endOffset", Integer, nullable=False)
    embedding = mapped_column(Vector(1536), nullable=False)
    model: Mapped[str] = mapped_column(
        String,
        default="fireworks/qwen3-embedding-8b",
        server_default=text("'fireworks/qwen3-embedding-8b'"),
    )
    chunk_metadata: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime.datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
    updatedAt: Mapped[datetime.datetime] = mapped_column(
        "updatedAt",
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        onupdate=func.now(),
    )

    document: Mapped[Document] = relationship(back_populates="chunks")
    user: Mapped[User] = relationship()


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[str] = mapped_column(
        PK_UUID, primary_key=True, default=_new_uuid, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    icon: Mapped[str] = mapped_column(String, nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    createdAt: Mapped[datetime.datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
    updatedAt: Mapped[datetime.datetime] = mapped_column(
        "updatedAt",
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        onupdate=func.now(),
    )

    categories: Mapped[list[TemplateCategory]] = relationship(back_populates="template")
    tags: Mapped[list[TemplateTag]] = relationship(back_populates="template")


class TemplateCategory(Base):
    __tablename__ = "template_categories"

    id: Mapped[str] = mapped_column(
        PK_UUID, primary_key=True, default=_new_uuid, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    icon: Mapped[str] = mapped_column(String, nullable=False)
    color: Mapped[str] = mapped_column(String, nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    level: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"))
    parentTemplateCategoryId: Mapped[str | None] = mapped_column(
        "parentTemplateCategoryId",
        FK_UUID,
        ForeignKey("template_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    templateId: Mapped[str | None] = mapped_column(
        "templateId",
        FK_UUID,
        ForeignKey("templates.id", ondelete="CASCADE"),
        nullable=True,
    )
    createdAt: Mapped[datetime.datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
    updatedAt: Mapped[datetime.datetime] = mapped_column(
        "updatedAt",
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        onupdate=func.now(),
    )

    template: Mapped[Template | None] = relationship(back_populates="categories")
    parentCategory: Mapped[TemplateCategory | None] = relationship(
        remote_side=[id],
        back_populates="childCategories",
        foreign_keys=[parentTemplateCategoryId],
    )
    childCategories: Mapped[list[TemplateCategory]] = relationship(back_populates="parentCategory")


class TemplateTag(Base):
    __tablename__ = "template_tags"

    id: Mapped[str] = mapped_column(
        PK_UUID, primary_key=True, default=_new_uuid, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    color: Mapped[str] = mapped_column(String, nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    templateId: Mapped[str | None] = mapped_column(
        "templateId",
        FK_UUID,
        ForeignKey("templates.id", ondelete="CASCADE"),
        nullable=True,
    )
    createdAt: Mapped[datetime.datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
    updatedAt: Mapped[datetime.datetime] = mapped_column(
        "updatedAt",
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        onupdate=func.now(),
    )

    template: Mapped[Template | None] = relationship(back_populates="tags")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(
        PK_UUID, primary_key=True, default=_new_uuid, server_default=text("gen_random_uuid()")
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(String, nullable=False)
    isRead: Mapped[bool] = mapped_column(
        "isRead", Boolean, default=False, server_default=text("false")
    )
    redirect: Mapped[str | None] = mapped_column(String, nullable=True)
    userId: Mapped[str] = mapped_column(
        "userId",
        FK_UUID,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    createdAt: Mapped[datetime.datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
    updatedAt: Mapped[datetime.datetime] = mapped_column(
        "updatedAt",
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[User] = relationship(back_populates="notifications")
