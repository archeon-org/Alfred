from dataclasses import dataclass
from datetime import datetime

import redis

from core.config import get_settings
from core.database import check_database_connection
from core.logging import get_logger

SERVICE_VERSION = "1.0.0"

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class HealthCheckResult:
    status: str
    timestamp: str
    version: str
    worker_host: str
    checks: dict[str, bool]


@dataclass(frozen=True, slots=True)
class ReadinessResult:
    ready: bool
    status: str


class HealthService:
    def __init__(self) -> None:
        self._settings = get_settings()

    async def get_health_status(self) -> HealthCheckResult:
        checks = {
            "database": await self._database_health(),
            "redis": self._redis_health(),
        }
        status = "healthy" if all(checks.values()) else "degraded"
        return HealthCheckResult(
            status=status,
            timestamp=datetime.utcnow().isoformat(),
            version=SERVICE_VERSION,
            worker_host=self._settings.worker_host,
            checks=checks,
        )

    async def get_readiness_status(self) -> ReadinessResult:
        database_ok = await self._database_health()
        if not database_ok:
            return ReadinessResult(ready=False, status="not ready - database")

        redis_ok = self._redis_health()
        if not redis_ok:
            return ReadinessResult(ready=False, status="not ready - redis")

        return ReadinessResult(ready=True, status="ready")

    async def _database_health(self) -> bool:
        try:
            return await check_database_connection()
        except Exception as error:
            logger.warning("Database health check failed", error=str(error))
            return False

    def _redis_health(self) -> bool:
        redis_settings = self._settings.redis
        client = redis.Redis(
            host=redis_settings.host,
            port=redis_settings.port,
            password=redis_settings.password.get_secret_value(),
            db=redis_settings.db,
            ssl=redis_settings.ssl,
            socket_timeout=5,
        )
        try:
            client.ping()
            return True
        except Exception as error:
            logger.warning("Redis health check failed", error=str(error))
            return False
        finally:
            client.close()


_health_service: HealthService | None = None


def get_health_service() -> HealthService:
    global _health_service
    if _health_service is None:
        _health_service = HealthService()
    return _health_service
