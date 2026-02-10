"""
Scribe API Application

FastAPI application for the Scribe microservice.
Provides health check endpoints and worker monitoring.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from api.health import router as health_router
from api.search import router as search_router
from api.question import router as question_router
from api.middleware import (
    SecurityHeadersMiddleware,
    RequestTimingMiddleware,
    RequestSizeLimitMiddleware,
)
from core.config import get_settings
from core.logging import get_logger, setup_logging

# Initialize logging
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    settings = get_settings()
    logger.info(
        "Starting Scribe API",
        env=settings.env,
        host=settings.api_host,
        port=settings.api_port,
        worker_host=settings.worker_host,
    )

    # Initialize LangSmith tracing (if API key is configured)
    try:
        from core.langsmith import initialize_langsmith
        
        if initialize_langsmith():
            logger.info("LangSmith LLM tracing enabled")
    except Exception as e:
        logger.debug(f"LangSmith initialization skipped: {e}")

    # Initialize Graphiti connection on startup
    try:
        from graphrag import initialize_graphiti, close_graphiti

        await initialize_graphiti()
        logger.info("Graphiti knowledge graph initialized")
    except Exception as e:
        logger.warning(f"Graphiti initialization failed (search may not work): {e}")

    yield

    # Cleanup Graphiti connection on shutdown
    try:
        from graphrag import close_graphiti

        await close_graphiti()
        logger.info("Graphiti connection closed")
    except Exception as e:
        logger.warning(f"Graphiti cleanup error: {e}")

    logger.info("Shutting down Scribe API")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Archeon Scribe API",
        description="""
## Overview

Scribe is the internal document processing microservice for Archeon.
It handles knowledge graph operations, document indexing, and AI-powered search.

## Authentication

All endpoints (except health checks) require the `X-Internal-API-Key` header
for service-to-service authentication.

## Features

- **Knowledge Graph Search**: Graphiti-powered semantic, keyword, and graph traversal search
- **Second Brain Q&A**: Ask questions and get AI-generated answers based on your documents
- **Entity Management**: Browse and manage entities extracted from documents

## Rate Limits

This is an internal service with no rate limiting. The caller (Gate API) 
is responsible for rate limiting user requests.
        """,
        version="1.0.0",
        contact={
            "name": "Archeon Team",
            "url": "https://archeon.app",
            "email": "support@archeon.app",
        },
        license_info={
            "name": "UNLICENSED",
        },
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        openapi_tags=[
            {
                "name": "Health",
                "description": "Service health and readiness checks",
            },
            {
                "name": "Search",
                "description": "Graphiti-powered knowledge graph search",
            },
            {
                "name": "Question",
                "description": "Second Brain Q&A - ask questions about your documents",
            },
        ],
        lifespan=lifespan,
    )

    # Security middleware
    if settings.is_production:
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=settings.trusted_hosts_list,
        )

    # Add security headers to all responses
    app.add_middleware(SecurityHeadersMiddleware)

    # Add request timing for monitoring
    app.add_middleware(RequestTimingMiddleware)

    # Limit request body size
    app.add_middleware(RequestSizeLimitMiddleware)

    # Include routers
    app.include_router(health_router, prefix="/api")
    app.include_router(search_router, prefix="/api")
    app.include_router(question_router, prefix="/api")

    # Prometheus metrics instrumentation
    # Exposes /metrics endpoint for Prometheus scraping
    Instrumentator().instrument(app).expose(app, endpoint="/metrics")

    @app.get("/")
    async def root():
        """Root endpoint."""
        return {
            "service": "archeon-scribe",
            "version": "1.0.0",
            "status": "running",
        }

    return app


# Create the app instance
app = create_app()


def main():
    """Run the API server (for development)."""
    import uvicorn

    settings = get_settings()

    # Determine number of workers
    # In production, use multiple workers for concurrency
    # In development, single worker with reload enabled
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
