"""
Health Check API

Endpoints for monitoring service health and readiness.
"""

from datetime import datetime

import redis
from fastapi import APIRouter, Response
from pydantic import BaseModel, Field

from core.config import get_settings
from core.database import check_database_connection
from core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/health", tags=["Health"])

settings = get_settings()


class HealthStatus(BaseModel):
    """Health check response model."""

    status: str = Field(..., description="Overall health status", example="healthy")
    timestamp: str = Field(
        ..., description="ISO 8601 timestamp", example="2024-01-15T10:30:00.000Z"
    )
    version: str = Field(..., description="Service version", example="1.0.0")
    worker_host: str = Field(..., description="Worker hostname", example="scribe-worker-1")
    checks: dict[str, bool] = Field(
        ...,
        description="Individual health check results",
        example={"database": True, "redis": True},
    )


class LivenessResponse(BaseModel):
    """Simple liveness probe response model."""

    status: str = Field(..., description="Liveness status", example="alive")


@router.get(
    "/",
    response_model=HealthStatus,
    summary="Comprehensive health check",
    description="Performs comprehensive health checks including database and Redis connectivity.",
    responses={
        200: {"description": "Service health status with individual check results"},
    },
)
async def health_check() -> HealthStatus:
    """
    Comprehensive health check.

    Checks:
    - Database connectivity
    - Redis connectivity
    - Service status
    """
    checks = {
        "database": False,
        "redis": False,
    }

    # Check database
    try:
        checks["database"] = await check_database_connection()
    except Exception as e:
        logger.warning("Database health check failed", error=str(e))

    # Check Redis
    try:
        redis_settings = settings.redis
        r = redis.Redis(
            host=redis_settings.host,
            port=redis_settings.port,
            password=redis_settings.password.get_secret_value(),
            db=redis_settings.db,
            ssl=redis_settings.ssl,
            socket_timeout=5,
        )
        r.ping()
        checks["redis"] = True
        r.close()
    except Exception as e:
        logger.warning("Redis health check failed", error=str(e))

    # Determine overall status
    all_healthy = all(checks.values())
    status = "healthy" if all_healthy else "degraded"

    return HealthStatus(
        status=status,
        timestamp=datetime.utcnow().isoformat(),
        version="1.0.0",
        worker_host=settings.worker_host,
        checks=checks,
    )


@router.get(
    "/live",
    response_model=LivenessResponse,
    summary="Liveness probe",
    description="Kubernetes liveness probe. Returns 200 if the service process is running.",
    responses={
        200: {"description": "Service is alive"},
    },
)
async def liveness_probe() -> LivenessResponse:
    """
    Kubernetes liveness probe.

    Returns 200 if the service is running.
    Used to determine if the container should be restarted.
    """
    return LivenessResponse(status="alive")


@router.get(
    "/ready",
    response_model=LivenessResponse,
    summary="Readiness probe",
    description="Kubernetes readiness probe. Returns 200 if the service is ready to accept traffic.",
    responses={
        200: {"description": "Service is ready"},
        503: {"description": "Service is not ready"},
    },
)
async def readiness_probe(response: Response) -> LivenessResponse:
    """
    Kubernetes readiness probe.

    Returns 200 if the service is ready to accept traffic.
    Checks database and Redis connectivity.
    """
    # Check database
    db_ok = await check_database_connection()
    if not db_ok:
        response.status_code = 503
        return LivenessResponse(status="not ready - database")

    # Check Redis
    try:
        redis_settings = settings.redis
        r = redis.Redis(
            host=redis_settings.host,
            port=redis_settings.port,
            password=redis_settings.password.get_secret_value(),
            db=redis_settings.db,
            ssl=redis_settings.ssl,
            socket_timeout=5,
        )
        r.ping()
        r.close()
    except Exception:
        response.status_code = 503
        return LivenessResponse(status="not ready - redis")

    return LivenessResponse(status="ready")
