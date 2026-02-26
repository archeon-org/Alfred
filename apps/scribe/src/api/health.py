from fastapi import APIRouter, Response

from api.presenters.health import (
    present_health_status,
    present_liveness,
    present_readiness,
    readiness_status_code,
)
from api.schemas.health import HealthStatus, LivenessResponse
from application.api.health_service import get_health_service

router = APIRouter(prefix="/health", tags=["Health"])


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
    health = await get_health_service().get_health_status()
    return present_health_status(health)


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
    return present_liveness()


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
    readiness = await get_health_service().get_readiness_status()
    response.status_code = readiness_status_code(readiness)
    return present_readiness(readiness)
