from __future__ import annotations

from application.workers.rag_task_service import get_rag_task_service
from core.celery_app import celery_app

INDEX_DOCUMENT_MAX_RETRIES = 2
DELETE_DOCUMENT_INDEX_MAX_RETRIES = 2


@celery_app.task(
    name="scribe.tasks.rag.index_document",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=10,
    retry_kwargs={"max_retries": INDEX_DOCUMENT_MAX_RETRIES},
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=600,
    time_limit=720,
)
def index_document(self, data: dict) -> dict[str, object]:
    return get_rag_task_service().index_document(
        data=data,
        retries=self.request.retries,
        max_retries=INDEX_DOCUMENT_MAX_RETRIES,
    )


@celery_app.task(
    name="scribe.tasks.rag.delete_document_index",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=10,
    retry_kwargs={"max_retries": DELETE_DOCUMENT_INDEX_MAX_RETRIES},
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=60,
    time_limit=120,
)
def delete_document_index(self, data: dict) -> dict[str, object]:
    return get_rag_task_service().delete_document_index(
        data=data,
        retries=self.request.retries,
    )


@celery_app.task(
    name="scribe.tasks.rag.backfill_documents",
    bind=True,
    acks_late=True,
    soft_time_limit=300,
    time_limit=420,
)
def backfill_documents(self, data: dict) -> dict[str, object]:
    return get_rag_task_service().backfill_documents(data=data)
