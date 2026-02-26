from pydantic import BaseModel, Field


class HealthStatus(BaseModel):
    status: str = Field(..., description="Overall health status", examples=["healthy"])
    timestamp: str = Field(
        ..., description="ISO 8601 timestamp", examples=["2024-01-15T10:30:00.000Z"]
    )
    version: str = Field(..., description="Service version", examples=["1.0.0"])
    worker_host: str = Field(..., description="Worker hostname", examples=["scribe-worker-1"])
    checks: dict[str, bool] = Field(
        ...,
        description="Individual health check results",
        examples=[{"database": True, "redis": True}],
    )


class LivenessResponse(BaseModel):
    status: str = Field(..., description="Liveness status", examples=["alive"])
