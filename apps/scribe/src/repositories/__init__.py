"""
Repository Layer

Abstracts all database operations for documents.
Single Responsibility: Only handles database I/O.
"""

from repositories.document import DocumentRepository

__all__ = ["DocumentRepository"]
