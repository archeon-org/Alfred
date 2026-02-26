from application.workers.document_task_service import get_document_task_service
from core.celery_app import celery_app


@celery_app.task(
    name="scribe.tasks.document.process_document",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=5,
    retry_kwargs={"max_retries": 1},
    acks_late=True,
    reject_on_worker_lost=True,
)
def process_document(self, data: dict) -> None:
    get_document_task_service().process_document(
        data=data,
        retries=self.request.retries,
        max_retries=self.max_retries or 1,
    )


@celery_app.task(
    name="scribe.tasks.document.generate_title",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=5,
    retry_kwargs={"max_retries": 1},
    acks_late=True,
)
def generate_title(self, data: dict) -> None:
    get_document_task_service().generate_title(data)
