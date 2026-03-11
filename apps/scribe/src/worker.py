from core.celery_app import celery_app
from core.config import get_settings
from core.logging import get_logger, setup_logging

setup_logging()
logger = get_logger(__name__)


def main():
    settings = get_settings()

    logger.info(
        "Starting Celery worker",
        worker_host=settings.worker_host,
        concurrency=settings.worker_concurrency,
    )

    celery_app.worker_main(
        [
            "worker",
            f"--hostname={settings.worker_host}@%h",
            f"--concurrency={settings.worker_concurrency}",
            "--loglevel=INFO",
            "--queues=celery",
            "--prefetch-multiplier=1",
            "--without-heartbeat",
            "--without-mingle",
            "--without-gossip",
        ]
    )


if __name__ == "__main__":
    main()
