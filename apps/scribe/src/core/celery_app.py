"""
Celery Application Configuration

Production-ready Celery setup with:
- Redis broker with authentication
- Task routing and priority
- Graceful shutdown handling
- Security best practices
- LangSmith tracing integration
"""

from celery import Celery
from celery.signals import task_prerun, task_postrun, task_failure, worker_process_init
from kombu import Exchange, Queue

from core.config import get_settings
from core.logging import get_logger, setup_logging

# Initialize logging
setup_logging()
logger = get_logger(__name__)

settings = get_settings()

# Create Celery application
celery_app = Celery(
    "scribe",
    broker=settings.redis.celery_broker_url,
    # We don't need result backend since we update DB directly
    backend=None,
    # Note: PYTHONPATH=/app/src so modules are 'tasks.document', not 'scribe.tasks.document'
    include=["tasks.document", "tasks.graphiti"],
)

# Task Queues - include 'celery' queue for celery-node compatibility
# celery-node sends to 'celery' queue by default
default_exchange = Exchange("celery", type="direct")

celery_app.conf.task_queues = (Queue("celery", default_exchange, routing_key="celery"),)

# Default queue - use 'celery' for celery-node compatibility
celery_app.conf.task_default_queue = "celery"
celery_app.conf.task_default_exchange = "celery"
celery_app.conf.task_default_routing_key = "celery"

# Task execution settings
celery_app.conf.update(
    # Acknowledgment
    task_acks_late=settings.celery.task_acks_late,
    task_reject_on_worker_lost=settings.celery.task_reject_on_worker_lost,
    # Time limits
    task_time_limit=settings.celery.task_time_limit,
    task_soft_time_limit=settings.celery.task_soft_time_limit,
    # Worker settings
    worker_prefetch_multiplier=settings.celery.worker_prefetch_multiplier,
    worker_max_tasks_per_child=settings.celery.worker_max_tasks_per_child,
    worker_hijack_root_logger=False,  # Don't override our logging
    # Serialization - JSON only for security (no pickle!)
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Timezone
    timezone="UTC",
    enable_utc=True,
    # Task tracking
    task_track_started=True,
    task_send_sent_event=True,
    # Broker connection settings
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=10,
    # Redis-specific settings
    broker_transport_options={
        "visibility_timeout": 3600,  # 1 hour
        "socket_timeout": 30,
        "socket_connect_timeout": 30,
    },
)


# Event listeners for logging using Celery signals
@task_prerun.connect
def task_prerun_handler(task_id: str, task: object, args: tuple, kwargs: dict, **kw) -> None:
    """Log when a task starts."""
    logger.info(
        "Task started",
        task_id=task_id,
        task_name=task.name if hasattr(task, "name") else str(task),
        worker_host=settings.worker_host,
    )


@task_postrun.connect
def task_postrun_handler(
    task_id: str, task: object, args: tuple, kwargs: dict, retval: object, state: str, **kw
) -> None:
    """Log when a task completes."""
    logger.info(
        "Task completed",
        task_id=task_id,
        task_name=task.name if hasattr(task, "name") else str(task),
        state=state,
        worker_host=settings.worker_host,
    )


@task_failure.connect
def task_failure_handler(
    task_id: str, exception: Exception, args: tuple, kwargs: dict, traceback: object, **kw
) -> None:
    """Log when a task fails."""
    logger.error(
        "Task failed",
        task_id=task_id,
        error=str(exception),
        worker_host=settings.worker_host,
    )


@worker_process_init.connect
def worker_process_init_handler(**kw) -> None:
    """Initialize worker process - called once per worker process."""
    # Initialize LangSmith tracing in each worker process
    try:
        from core.langsmith import initialize_langsmith
        
        if initialize_langsmith():
            logger.info("LangSmith LLM tracing enabled in worker process")
    except Exception as e:
        logger.debug(f"LangSmith initialization skipped in worker: {e}")
