from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from api.errors import api_service_error_handler
from api.health import router as health_router
from api.middleware import (
    RequestSizeLimitMiddleware,
    RequestTimingMiddleware,
    SecurityHeadersMiddleware,
)
from api.rag import router as rag_router
from application.api.errors import ApiServiceError
from core.config import get_settings
from core.logging import get_logger, setup_logging

setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info(
        "Starting Scribe API",
        env=settings.env,
        host=settings.api_host,
        port=settings.api_port,
        worker_host=settings.worker_host,
    )

    try:
        from core.langsmith import initialize_langsmith

        if initialize_langsmith():
            logger.info("LangSmith LLM tracing enabled")
    except Exception as error:
        logger.debug(f"LangSmith initialization skipped: {error}")

    yield

    logger.info("Shutting down Scribe API")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Archeon Scribe API",
        description="""
Overview
Scribe is the internal document processing microservice for Archeon.
It handles document indexing and AI-powered chunk-level retrieval.

Authentication
All endpoints (except health checks) require the X-Internal-API-Key header
for service-to-service authentication.

Features
- RAG Search: pgvector and full-text hybrid retrieval over document chunks
- Chat and Q&A: chunk-cited AI answers over indexed user documents

Rate Limits
This is an internal service with no rate limiting.
The caller (Gate API) is responsible for rate limiting user requests.
        """,
        version="1.0.0",
        contact={
            "name": "Archeon Team",
            "url": "https://archeon.app",
            "email": "support@archeon.app",
        },
        license_info={"name": "UNLICENSED"},
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        openapi_tags=[
            {"name": "Health", "description": "Service health and readiness checks"},
            {"name": "RAG", "description": "Chunk-level retrieval and answer orchestration"},
        ],
        lifespan=lifespan,
    )

    if settings.is_production:
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=settings.trusted_hosts_list,
        )

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestTimingMiddleware)
    app.add_middleware(RequestSizeLimitMiddleware)

    app.include_router(health_router, prefix="/api")
    app.include_router(rag_router, prefix="/api")
    app.add_exception_handler(ApiServiceError, api_service_error_handler)  # type: ignore[arg-type]

    @app.get("/")
    async def root():
        return {
            "service": "archeon-scribe",
            "version": "1.0.0",
            "status": "running",
        }

    return app


app = create_app()


def main():
    import uvicorn

    settings = get_settings()
    workers = 1 if not settings.is_production else settings.uvicorn_workers
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=not settings.is_production,
        workers=workers,
        limit_concurrency=settings.uvicorn_limit_concurrency,
        timeout_keep_alive=settings.uvicorn_timeout_keep_alive,
        backlog=settings.uvicorn_backlog,
        log_level=settings.log_level.lower(),
        access_log=settings.is_production,
    )


if __name__ == "__main__":
    main()
