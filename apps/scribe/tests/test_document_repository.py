"""Tests for DocumentRepository using the ORM-based implementation."""

from __future__ import annotations

import uuid

from db.models import Category, Document, DocumentTag, Tag, User
from domain.models import ProcessingStatus
from repositories.document import DocumentRepository


def _seed_user(session, user_id: str) -> None:
    session.add(
        User(
            id=user_id,
            email=f"{user_id[:8]}@test.com",
            firstName="Test",
            lastName="User",
            provider="EMAIL",
            storageLimit=1_000_000,
        )
    )
    session.flush()


def _seed_document(session, document_id: str, user_id: str, **overrides) -> None:
    defaults = {
        "id": document_id,
        "userId": user_id,
        "filename": "test.pdf",
        "originalName": "test.pdf",
        "mimetype": "application/pdf",
        "size": 1024,
        "path": "uploads/test.pdf",
    }
    defaults.update(overrides)
    session.add(Document(**defaults))
    session.flush()


class TestGetMimetype:
    def test_returns_mimetype(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id, mimetype="image/png")

        repo = DocumentRepository(session)
        assert repo.get_mimetype(sample_document_id) == "image/png"

    def test_returns_none_for_missing_document(self, session):
        repo = DocumentRepository(session)
        assert repo.get_mimetype(str(uuid.uuid4())) is None


class TestGetContent:
    def test_returns_content(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id, content="hello world")

        repo = DocumentRepository(session)
        assert repo.get_content(sample_document_id) == "hello world"

    def test_returns_none_when_no_content(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id)

        repo = DocumentRepository(session)
        assert repo.get_content(sample_document_id) is None


class TestProcessingStatus:
    def test_update_and_get_status(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id)

        repo = DocumentRepository(session)
        repo.update_status(sample_document_id, ProcessingStatus.PROCESSING)

        result = repo.get_processing_status(sample_document_id)
        assert result is not None
        assert result[0] == "PROCESSING"

    def test_is_already_processed_false_by_default(
        self, session, sample_user_id, sample_document_id
    ):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id)

        repo = DocumentRepository(session)
        assert repo.is_already_processed(sample_document_id) is False

    def test_is_already_processed_after_completion(
        self, session, sample_user_id, sample_document_id
    ):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id)

        repo = DocumentRepository(session)
        repo.complete_processing(sample_document_id, "content", "Title", None)

        assert repo.is_already_processed(sample_document_id) is True


class TestCompleteProcessing:
    def test_sets_all_fields(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        cat = Category(name="Finance", userId=sample_user_id, isSystemDefault=True)
        session.add(cat)
        session.flush()
        cat_id = str(cat.id)

        _seed_document(session, sample_document_id, sample_user_id)

        repo = DocumentRepository(session)
        repo.complete_processing(sample_document_id, "extracted text", "Invoice #42", cat_id)

        doc = session.get(Document, sample_document_id)
        assert doc is not None
        assert doc.content == "extracted text"
        assert doc.title == "Invoice #42"
        assert str(doc.categoryId) == cat_id
        assert doc.isProcessed is True
        assert doc.processingStatus == "COMPLETED"
        assert doc.classificationSource == "AI"


class TestUserTaxonomy:
    def test_returns_categories_and_tags(self, session, sample_user_id):
        _seed_user(session, sample_user_id)
        finance = Category(name="Finance", userId=sample_user_id, isSystemDefault=True)
        session.add(finance)
        session.flush()
        session.add(
            Category(
                name="Bills",
                userId=sample_user_id,
                isSystemDefault=True,
                parentId=finance.id,
            )
        )
        session.add(Category(name="Medical", userId=sample_user_id, isSystemDefault=True))
        session.add(Tag(name="urgent", userId=sample_user_id, isSystemDefault=True))
        session.flush()

        repo = DocumentRepository(session)
        taxonomy = repo.get_user_taxonomy(sample_user_id)

        assert len(taxonomy.categories) == 3
        assert len(taxonomy.tags) == 1
        assert taxonomy.tags[0]["name"] == "urgent"
        finance_category = next(
            category for category in taxonomy.categories if category["name"] == "Finance"
        )
        bills_category = next(
            category for category in taxonomy.categories if category["name"] == "Bills"
        )
        assert finance_category["path"] == "Finance"
        assert finance_category["level"] == 1
        assert finance_category["isLeaf"] is False
        assert bills_category["path"] == "Finance/Bills"
        assert bills_category["level"] == 2
        assert bills_category["isLeaf"] is True

    def test_empty_taxonomy(self, session, sample_user_id):
        _seed_user(session, sample_user_id)

        repo = DocumentRepository(session)
        taxonomy = repo.get_user_taxonomy(sample_user_id)

        assert taxonomy.categories == []
        assert taxonomy.tags == []


class TestUpdateTags:
    def test_assigns_tags_to_document(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id)

        t1 = Tag(name="urgent", userId=sample_user_id, isSystemDefault=True)
        t2 = Tag(name="review", userId=sample_user_id, isSystemDefault=True)
        session.add_all([t1, t2])
        session.flush()

        repo = DocumentRepository(session)
        repo.update_tags(sample_document_id, [str(t1.id), str(t2.id)])

        tags = session.query(DocumentTag).filter_by(documentId=sample_document_id).all()
        assert len(tags) == 2

    def test_replaces_existing_tags(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id)

        t1 = Tag(name="old", userId=sample_user_id, isSystemDefault=True)
        t2 = Tag(name="new", userId=sample_user_id, isSystemDefault=True)
        session.add_all([t1, t2])
        session.flush()

        repo = DocumentRepository(session)
        repo.update_tags(sample_document_id, [str(t1.id)])
        repo.update_tags(sample_document_id, [str(t2.id)])

        tags = session.query(DocumentTag).filter_by(documentId=sample_document_id).all()
        assert len(tags) == 1
        assert str(tags[0].tagId) == str(t2.id)


class TestCreateCategory:
    def test_creates_and_returns_id(self, session, sample_user_id):
        _seed_user(session, sample_user_id)

        repo = DocumentRepository(session)
        parent_id = repo.create_category(sample_user_id, "Legal", "gavel", "#FF0000")
        child_id = repo.create_category(
            sample_user_id,
            "Invoices",
            "receipt",
            "#00AA00",
            parent_id=parent_id,
        )

        parent = session.get(Category, parent_id)
        child = session.get(Category, child_id)
        assert parent is not None
        assert parent.name == "Legal"
        assert parent.icon == "gavel"
        assert parent.color == "#FF0000"
        assert parent.isSystemDefault is True
        assert child is not None
        assert str(child.parentId) == parent_id
