from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from core.logging import get_logger
from db.models import Category, Document, DocumentTag, Tag
from domain.models import ProcessingStatus

logger = get_logger(__name__)


@dataclass
class UserTaxonomy:
    categories: list[dict[str, Any]]
    tags: list[dict[str, Any]]


class DocumentRepository:
    def __init__(self, session: Session):
        self._session = session

    def get_mimetype(self, document_id: str) -> str | None:
        stmt = select(Document.mimetype).where(Document.id == document_id)
        result = self._session.execute(stmt).scalar_one_or_none()
        return result

    def get_content(self, document_id: str) -> str | None:
        stmt = select(Document.content).where(Document.id == document_id)
        result = self._session.execute(stmt).scalar_one_or_none()
        return result

    def get_processing_status(self, document_id: str) -> tuple[str, bool] | None:
        stmt = select(Document.processingStatus, Document.isProcessed).where(
            Document.id == document_id
        )
        result = self._session.execute(stmt).first()
        return (result[0], result[1]) if result else None

    def is_already_processed(self, document_id: str) -> bool:
        result = self.get_processing_status(document_id)
        if not result:
            return False
        status, is_processed = result
        return is_processed or status == ProcessingStatus.COMPLETED.value

    def get_user_taxonomy(self, user_id: str) -> UserTaxonomy:
        cat_stmt = (
            select(Category.id, Category.name, Category.parentId, Category.order)
            .where(Category.userId == user_id)
            .order_by(Category.order.asc(), Category.name.asc())
        )
        categories_result = self._session.execute(cat_stmt).all()

        tag_stmt = (
            select(Tag.id, Tag.name, Tag.order)
            .where(Tag.userId == user_id)
            .order_by(Tag.order.asc(), Tag.name.asc())
        )
        tags_result = self._session.execute(tag_stmt).all()

        category_map = {
            str(row[0]): {
                "id": str(row[0]),
                "name": row[1],
                "parentId": str(row[2]) if row[2] else None,
                "order": row[3] or 0,
            }
            for row in categories_result
        }

        children_by_parent: dict[str, set[str]] = {}
        for category in category_map.values():
            parent_id = category["parentId"]
            if parent_id:
                children_by_parent.setdefault(parent_id, set()).add(category["id"])

        path_cache: dict[str, str] = {}

        def resolve_path(category_id: str, seen: set[str] | None = None) -> str:
            if category_id in path_cache:
                return path_cache[category_id]

            category = category_map.get(category_id)
            if not category:
                return ""

            local_seen = set() if seen is None else seen
            if category_id in local_seen:
                return category["name"]

            local_seen.add(category_id)
            parent_id = category["parentId"]
            if parent_id and parent_id in category_map:
                parent_path = resolve_path(parent_id, local_seen)
                path = f"{parent_path}/{category['name']}" if parent_path else category["name"]
            else:
                path = category["name"]

            path_cache[category_id] = path
            return path

        return UserTaxonomy(
            categories=sorted(
                [
                    {
                        **category,
                        "path": resolve_path(category["id"]),
                        "level": resolve_path(category["id"]).count("/") + 1,
                        "isLeaf": category["id"] not in children_by_parent,
                    }
                    for category in category_map.values()
                ],
                key=lambda item: (
                    int(item["level"]),
                    int(item["order"]),
                    str(item["path"]).lower(),
                ),
            ),
            tags=[
                {
                    "id": str(row[0]),
                    "name": row[1],
                    "order": row[2] or 0,
                }
                for row in tags_result
            ],
        )

    def update_status(self, document_id: str, status: ProcessingStatus) -> None:
        stmt = (
            update(Document).where(Document.id == document_id).values(processingStatus=status.value)
        )
        self._session.execute(stmt)
        self._session.commit()
        logger.debug("Updated status", document_id=document_id, status=status.value)

    def update_content(self, document_id: str, content: str) -> None:
        stmt = update(Document).where(Document.id == document_id).values(content=content)
        self._session.execute(stmt)
        self._session.commit()

    def update_title(self, document_id: str, title: str) -> None:
        stmt = update(Document).where(Document.id == document_id).values(title=title)
        self._session.execute(stmt)
        self._session.commit()

    def complete_processing(
        self,
        document_id: str,
        content: str,
        title: str,
        category_id: str | None,
    ) -> None:
        stmt = (
            update(Document)
            .where(Document.id == document_id)
            .values(
                content=content,
                processingStatus=ProcessingStatus.COMPLETED.value,
                isProcessed=True,
                classificationSource="AI",
                title=title,
                categoryId=category_id,
            )
        )
        self._session.execute(stmt)
        self._session.commit()
        logger.info("Document processing completed", document_id=document_id)

    def mark_failed(self, document_id: str) -> None:
        self.update_status(document_id, ProcessingStatus.FAILED)

    def update_tags(self, document_id: str, tag_ids: list[str]) -> None:
        del_stmt = delete(DocumentTag).where(DocumentTag.documentId == document_id)
        self._session.execute(del_stmt)

        for tag_id in tag_ids:
            ins_stmt = pg_insert(DocumentTag).values(
                documentId=document_id,
                tagId=tag_id,
            )
            self._session.execute(ins_stmt)

        self._session.commit()
        logger.debug("Updated tags", document_id=document_id, count=len(tag_ids))

    def create_category(
        self,
        user_id: str,
        name: str,
        icon: str,
        color: str,
        parent_id: str | None = None,
        order: int = 0,
    ) -> str:
        new_category = Category(
            name=name,
            icon=icon,
            color=color,
            userId=user_id,
            isSystemDefault=True,
            parentId=parent_id,
            order=order,
        )
        self._session.add(new_category)
        self._session.flush()
        category_id = str(new_category.id)
        self._session.commit()
        logger.info("Created category", category_id=category_id, name=name)
        return category_id
