from application.workers.graphiti_task_service import get_graphiti_task_service
from core.celery_app import celery_app


@celery_app.task(
    name="scribe.tasks.graphiti.ingest_document_to_graph",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=10,
    retry_kwargs={"max_retries": 2},
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=600,
    time_limit=720,
)
def ingest_document_to_graph(self, data: dict) -> dict:
    return get_graphiti_task_service().ingest_document_to_graph(
        data=data,
        retries=self.request.retries,
        max_retries=self.max_retries or 2,
    )


@celery_app.task(
    name="scribe.tasks.graphiti.ingest_documents_bulk",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=30,
    retry_kwargs={"max_retries": 1},
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=600,
    time_limit=720,
)
def ingest_documents_bulk(self, data: dict) -> dict:
    return get_graphiti_task_service().ingest_documents_bulk(
        data=data,
        retries=self.request.retries,
    )


@celery_app.task(
    name="scribe.tasks.graphiti.retrieve_context",
    bind=True,
    acks_late=True,
    soft_time_limit=60,
    time_limit=90,
)
def retrieve_context(self, data: dict) -> dict:
    return get_graphiti_task_service().retrieve_context(data)


@celery_app.task(
    name="scribe.tasks.graphiti.initialize_graph",
    bind=True,
    acks_late=True,
    soft_time_limit=120,
    time_limit=180,
)
def initialize_graph(self) -> dict:
    return get_graphiti_task_service().initialize_graph()


@celery_app.task(
    name="scribe.tasks.graphiti.delete_document_from_graph",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=10,
    retry_kwargs={"max_retries": 2},
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=60,
    time_limit=120,
)
def delete_document_from_graph(self, data: dict) -> dict:
    return get_graphiti_task_service().delete_document_from_graph(
        data=data,
        retries=self.request.retries,
    )
