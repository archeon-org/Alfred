"""
Document Repository

Handles all database operations for documents.
Single Responsibility: Only database I/O, no business logic.
"""

from dataclasses import dataclass
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.logging import get_logger
from domain.models import ProcessingStatus

logger = get_logger(__name__)


@dataclass
class UserTaxonomy:
    """User's categories and tags for classification."""

    categories: list[dict[str, str]]  # [{"id": "uuid", "name": "Category Name"}]
    tags: list[dict[str, str]]  # [{"id": "uuid", "name": "Tag Name"}]


class DocumentRepository:
    """
    Repository for document database operations.

    Single Responsibility: Only handles database I/O.
    All queries are isolated here for easy testing and modification.
    """

    def __init__(self, session: Session):
        self._session = session

    # ========================================================================
    # READ Operations
    # ========================================================================

    def get_mimetype(self, document_id: str) -> str | None:
        """Get document mimetype."""
        result = self._session.execute(
            text("SELECT mimetype FROM documents WHERE id = :id"),
            {"id": document_id},
        ).fetchone()
        return result[0] if result else None

    def get_content(self, document_id: str) -> str | None:
        """Get document text content."""
        result = self._session.execute(
            text("SELECT content FROM documents WHERE id = :id"),
            {"id": document_id},
        ).fetchone()
        return result[0] if result else None

    def get_processing_status(self, document_id: str) -> tuple[str, bool] | None:
        """Get document processing status and isProcessed flag."""
        result = self._session.execute(
            text('SELECT "processingStatus", "isProcessed" FROM documents WHERE id = :id'),
            {"id": document_id},
        ).fetchone()
        return (result[0], result[1]) if result else None

    def is_already_processed(self, document_id: str) -> bool:
        """Check if document is already processed."""
        result = self.get_processing_status(document_id)
        if not result:
            return False
        status, is_processed = result
        return is_processed or status == ProcessingStatus.COMPLETED.value

    def get_user_taxonomy(self, user_id: str) -> UserTaxonomy:
        """Get user's categories and tags for classification."""
        categories_result = self._session.execute(
            text('SELECT id, name FROM categories WHERE "userId" = :user_id'),
            {"user_id": user_id},
        ).fetchall()

        tags_result = self._session.execute(
            text('SELECT id, name FROM tags WHERE "userId" = :user_id'),
            {"user_id": user_id},
        ).fetchall()

        return UserTaxonomy(
            categories=[{"id": str(r[0]), "name": r[1]} for r in categories_result],
            tags=[{"id": str(r[0]), "name": r[1]} for r in tags_result],
        )

    # ========================================================================
    # WRITE Operations
    # ========================================================================

    def update_status(self, document_id: str, status: ProcessingStatus) -> None:
        """Update document processing status."""
        self._session.execute(
            text('UPDATE documents SET "processingStatus" = :status WHERE id = :id'),
            {"status": status.value, "id": document_id},
        )
        self._session.commit()
        logger.debug("Updated status", document_id=document_id, status=status.value)

    def update_content(self, document_id: str, content: str) -> None:
        """Update document text content."""
        self._session.execute(
            text("UPDATE documents SET content = :content WHERE id = :id"),
            {"content": content, "id": document_id},
        )
        self._session.commit()

    def update_title(self, document_id: str, title: str) -> None:
        """Update document title."""
        self._session.execute(
            text("UPDATE documents SET title = :title WHERE id = :id"),
            {"title": title, "id": document_id},
        )
        self._session.commit()

    def complete_processing(
        self,
        document_id: str,
        content: str,
        title: str,
        category_id: str | None,
    ) -> None:
        """Mark document as successfully processed with all metadata."""
        self._session.execute(
            text("""
                UPDATE documents
                SET content = :content,
                    "processingStatus" = :status,
                    "isProcessed" = true,
                    "classificationSource" = 'AI',
                    title = :title,
                    "categoryId" = :category_id
                WHERE id = :id
            """),
            {
                "content": content,
                "status": ProcessingStatus.COMPLETED.value,
                "title": title,
                "category_id": category_id,
                "id": document_id,
            },
        )
        self._session.commit()
        logger.info("Document processing completed", document_id=document_id)

    def mark_failed(self, document_id: str) -> None:
        """Mark document as failed."""
        self.update_status(document_id, ProcessingStatus.FAILED)

    # ========================================================================
    # Tag Operations
    # ========================================================================

    def update_tags(self, document_id: str, tag_ids: list[str]) -> None:
        """Update document tags (replaces existing)."""
        # Clear existing tags
        self._session.execute(
            text('DELETE FROM document_tags WHERE "documentId" = :doc_id'),
            {"doc_id": document_id},
        )

        # Add new tags
        for tag_id in tag_ids:
            self._session.execute(
                text('INSERT INTO document_tags ("documentId", "tagId") VALUES (:doc_id, :tag_id)'),
                {"doc_id": document_id, "tag_id": tag_id},
            )

        self._session.commit()
        logger.debug("Updated tags", document_id=document_id, count=len(tag_ids))

    # ========================================================================
    # Category Operations
    # ========================================================================

    def create_category(
        self,
        user_id: str,
        name: str,
        icon: str,
        color: str,
    ) -> str:
        """Create a new category and return its ID."""
        result = self._session.execute(
            text("""
                INSERT INTO categories (name, icon, color, "userId", "isSystemDefault")
                VALUES (:name, :icon, :color, :user_id, true)
                RETURNING id
            """),
            {
                "name": name,
                "icon": icon,
                "color": color,
                "user_id": user_id,
            },
        )
        category_id = str(result.fetchone()[0])
        self._session.commit()
        logger.info("Created category", category_id=category_id, name=name)
        return category_id
