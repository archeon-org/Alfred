from typing import Any

from celery import Celery
from celery.signals import task_failure, task_postrun, task_prerun, worker_process_init
from kombu import Exchange, Queue

from core.config import get_settings
from core.logging import get_logger, setup_logging

setup_logging()
logger = get_logger(__name__)

settings = get_settings()


celery_app = Celery(
    "scribe",
    broker=settings.redis.celery_broker_url,
    backend=None,
    include=["tasks.document", "tasks.rag"],
)


default_exchange = Exchange("celery", type="direct")

celery_app.conf.task_queues = (Queue("celery", default_exchange, routing_key="celery"),)


celery_app.conf.task_default_queue = "celery"
celery_app.conf.task_default_exchange = "celery"  # type: ignore[assignment]
celery_app.conf.task_default_routing_key = "celery"  # type: ignore[assignment]


celery_app.conf.update(
    task_acks_late=settings.celery.task_acks_late,
    task_reject_on_worker_lost=settings.celery.task_reject_on_worker_lost,
    task_time_limit=settings.celery.task_time_limit,
    task_soft_time_limit=settings.celery.task_soft_time_limit,
    worker_prefetch_multiplier=settings.celery.worker_prefetch_multiplier,
    worker_max_tasks_per_child=settings.celery.worker_max_tasks_per_child,
    worker_hijack_root_logger=False,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_send_sent_event=True,
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=10,
    broker_transport_options={
        "visibility_timeout": 3600,
        "socket_timeout": 30,
        "socket_connect_timeout": 30,
    },
)


@task_prerun.connect
def task_prerun_handler(task_id: str, task: Any, args: tuple, kwargs: dict, **kw: Any) -> None:
    logger.info(
        "Task started",
        task_id=task_id,
        task_name=task.name if hasattr(task, "name") else str(task),
        worker_host=settings.worker_host,
    )


@task_postrun.connect
def task_postrun_handler(
    task_id: str, task: Any, args: tuple, kwargs: dict, retval: Any, state: str, **kw: Any
) -> None:
    logger.info(
        "Task completed",
        task_id=task_id,
        task_name=task.name if hasattr(task, "name") else str(task),
        state=state,
        worker_host=settings.worker_host,
    )


@task_failure.connect
def task_failure_handler(
    task_id: str, exception: Exception, args: tuple, kwargs: dict, traceback: Any, **kw: Any
) -> None:
    logger.error(
        "Task failed",
        task_id=task_id,
        error=str(exception),
        worker_host=settings.worker_host,
    )


@worker_process_init.connect
def worker_process_init_handler(**kw: Any) -> None:

    try:
        from core.langsmith import initialize_langsmith

        if initialize_langsmith():
            logger.info("LangSmith LLM tracing enabled in worker process")
    except Exception as e:
        logger.debug(f"LangSmith initialization skipped in worker: {e}")
