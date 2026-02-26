from api.schemas.health import HealthStatus, LivenessResponse
from application.api.health_service import HealthCheckResult, ReadinessResult


def present_health_status(health: HealthCheckResult) -> HealthStatus:
    return HealthStatus(
        status=health.status,
        timestamp=health.timestamp,
        version=health.version,
        worker_host=health.worker_host,
        checks=health.checks,
    )


def present_liveness() -> LivenessResponse:
    return LivenessResponse(status="alive")


def present_readiness(readiness: ReadinessResult) -> LivenessResponse:
    return LivenessResponse(status=readiness.status)


def readiness_status_code(readiness: ReadinessResult) -> int:
    return 200 if readiness.ready else 503
