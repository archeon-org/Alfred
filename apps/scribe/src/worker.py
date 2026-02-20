"""
Celery Worker Entry Point

Start Celery workers with proper configuration.
"""

from core.celery_app import celery_app
from core.config import get_settings
from core.logging import get_logger, setup_logging

# Initialize logging
setup_logging()
logger = get_logger(__name__)


def main():
    """Start the Celery worker."""
    settings = get_settings()

    logger.info(
        "Starting Celery worker",
        worker_host=settings.worker_host,
        concurrency=settings.worker_concurrency,
    )

    # Start worker with configuration
    celery_app.worker_main(
        [
            "worker",
            f"--hostname={settings.worker_host}@%h",
            f"--concurrency={settings.worker_concurrency}",
            "--loglevel=INFO",
            "--queues=celery",
            "--prefetch-multiplier=1",
            "--without-heartbeat",  # Reduce Redis connections
            "--without-mingle",  # Don't sync with other workers on startup
            "--without-gossip",  # Don't subscribe to worker events
        ]
    )


if __name__ == "__main__":
    main()
