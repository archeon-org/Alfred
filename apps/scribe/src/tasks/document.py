from application.workers.document_task_service import get_document_task_service
from core.celery_app import celery_app

PROCESS_DOCUMENT_MAX_RETRIES = 1
GENERATE_TITLE_MAX_RETRIES = 1


@celery_app.task(
    name="scribe.tasks.document.process_document",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=5,
    retry_kwargs={"max_retries": PROCESS_DOCUMENT_MAX_RETRIES},
    acks_late=True,
    reject_on_worker_lost=True,
)
def process_document(self, data: dict) -> None:
    get_document_task_service().process_document(
        data=data,
        retries=self.request.retries,
        max_retries=PROCESS_DOCUMENT_MAX_RETRIES,
    )


@celery_app.task(
    name="scribe.tasks.document.process_documents_bulk",
    bind=True,
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=1800,
    time_limit=2100,
)
def process_documents_bulk(self, data: dict) -> dict[str, object]:
    return get_document_task_service().process_documents_bulk(data=data)


@celery_app.task(
    name="scribe.tasks.document.generate_title",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=5,
    retry_kwargs={"max_retries": GENERATE_TITLE_MAX_RETRIES},
    acks_late=True,
)
def generate_title(self, data: dict) -> None:
    get_document_task_service().generate_title(data)
