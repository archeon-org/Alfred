from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DATABASE_",
        extra="ignore",
    )

    host: str = Field(default="postgres-archeon", description="Database host")
    port: int = Field(default=5432, ge=1, le=65535, description="Database port")
    name: str = Field(default="postgres", description="Database name")
    username: str = Field(default="postgres", description="Database user")
    password: SecretStr = Field(default=SecretStr("postgres"), description="Database password")
    ssl: bool = Field(default=False, description="Use SSL connection")
    pool_size: int = Field(default=5, ge=1, le=20, description="Connection pool size")
    max_overflow: int = Field(default=10, ge=0, le=50, description="Max overflow connections")

    @property
    def url(self) -> str:
        ssl_param = "?sslmode=require" if self.ssl else ""
        return (
            f"postgresql://{self.username}:{self.password.get_secret_value()}"
            f"@{self.host}:{self.port}/{self.name}{ssl_param}"
        )

    @property
    def async_url(self) -> str:
        ssl_param = "?ssl=require" if self.ssl else ""
        return (
            f"postgresql+asyncpg://{self.username}:{self.password.get_secret_value()}"
            f"@{self.host}:{self.port}/{self.name}{ssl_param}"
        )


class RedisSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="REDIS_",
        extra="ignore",
    )

    host: str = Field(default="redis-archeon", description="Redis host")
    port: int = Field(default=6379, ge=1, le=65535, description="Redis port")
    password: SecretStr = Field(default=SecretStr("RedisPassword123"), description="Redis password")
    db: int = Field(default=0, ge=0, le=15, description="Redis database number")
    ssl: bool = Field(default=False, description="Use SSL connection")

    @property
    def url(self) -> str:
        protocol = "rediss" if self.ssl else "redis"
        password = self.password.get_secret_value()
        return f"{protocol}://:{password}@{self.host}:{self.port}/{self.db}"

    @property
    def celery_broker_url(self) -> str:
        return self.url


class R2Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="R2_",
        extra="ignore",
    )

    account_id: str = Field(..., description="Cloudflare account ID")
    access_key_id: SecretStr = Field(..., description="R2 access key ID")
    secret_access_key: SecretStr = Field(..., description="R2 secret access key")
    bucket_name: str = Field(..., description="R2 bucket name")
    public_url: str = Field(default="", description="Public URL for bucket")

    @property
    def endpoint_url(self) -> str:
        return f"https://{self.account_id}.r2.cloudflarestorage.com"


class AISettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="",
        extra="ignore",
    )

    fireworks_api_key: SecretStr = Field(..., alias="FIREWORKS_API_KEY")
    fireworks_base_url: str = Field(
        default="https://api.fireworks.ai/inference/v1", alias="FIREWORKS_BASE_URL"
    )
    classification_model: str = Field(
        default="accounts/fireworks/models/deepseek-v3p1",
        alias="CLASSIFICATION_MODEL",
    )
    embedding_model: str = Field(default="nomic-ai/nomic-embed-text-v1.5", alias="EMBEDDING_MODEL")
    embedding_dimensions: int = Field(default=768, alias="EMBEDDING_DIMENSIONS")


class OCRSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="",
        extra="ignore",
    )

    mistral_base_url: str = Field(
        default="https://api.mistral.ai/v1",
        alias="MISTRAL_OCR_BASE_URL",
    )
    mistral_api_key: SecretStr = Field(default=SecretStr(""), alias="MISTRAL_OCR_API_KEY")
    mistral_model: str = Field(default="mistral-ocr-latest", alias="MISTRAL_OCR_MODEL")
    mistral_timeout: int = Field(default=120, ge=10, le=600, alias="MISTRAL_OCR_TIMEOUT")
    mistral_table_format: Literal["html", "markdown", "none"] = Field(
        default="none", alias="MISTRAL_OCR_TABLE_FORMAT"
    )
    mistral_extract_header: bool = Field(default=False, alias="MISTRAL_OCR_EXTRACT_HEADER")
    mistral_extract_footer: bool = Field(default=False, alias="MISTRAL_OCR_EXTRACT_FOOTER")
    pdf_max_pages: int = Field(default=10, ge=1, le=100, alias="PDF_MAX_PAGES")


class CelerySettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CELERY_",
        extra="ignore",
    )

    task_acks_late: bool = Field(default=True, description="Acknowledge after task completion")
    task_reject_on_worker_lost: bool = Field(default=True, description="Reject task if worker dies")
    task_time_limit: int = Field(default=300, ge=60, description="Hard time limit in seconds")
    task_soft_time_limit: int = Field(default=240, ge=30, description="Soft time limit in seconds")
    worker_prefetch_multiplier: int = Field(default=1, ge=1, le=10)
    worker_max_tasks_per_child: int = Field(default=50, ge=1, le=1000)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    env: Literal["development", "staging", "production"] = Field(default="development")
    debug: bool = Field(default=False)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(default="INFO")

    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000, ge=1, le=65535)

    uvicorn_workers: int = Field(
        default=4,
        ge=1,
        le=32,
        alias="UVICORN_WORKERS",
        description="Number of uvicorn worker processes (recommended: 2-4 x CPU cores)",
    )
    uvicorn_limit_concurrency: int = Field(
        default=1000,
        ge=10,
        le=10000,
        alias="UVICORN_LIMIT_CONCURRENCY",
        description="Maximum number of concurrent connections",
    )
    uvicorn_timeout_keep_alive: int = Field(
        default=5,
        ge=1,
        le=60,
        alias="UVICORN_TIMEOUT_KEEP_ALIVE",
        description="Keep-alive timeout in seconds",
    )
    uvicorn_backlog: int = Field(
        default=2048,
        ge=128,
        le=8192,
        alias="UVICORN_BACKLOG",
        description="Maximum number of pending connections",
    )

    max_request_size: int = Field(
        default=52428800,
        ge=1048576,
        le=104857600,
        alias="MAX_REQUEST_SIZE",
        description="Maximum request body size in bytes",
    )

    worker_host: str = Field(default="scribe-worker-1")
    worker_concurrency: int = Field(default=2, ge=1, le=16)

    metrics_push_enabled: bool = Field(
        default=True,
        alias="METRICS_PUSH_ENABLED",
        description="Enable pushing worker metrics to Prometheus Pushgateway",
    )
    pushgateway_url: str = Field(
        default="pushgateway:9091",
        alias="PUSHGATEWAY_URL",
        description="Prometheus Pushgateway address",
    )

    trusted_hosts: str = Field(default="localhost,127.0.0.1")

    internal_api_key: str = Field(default="", alias="INTERNAL_API_KEY")

    @property
    def database(self) -> DatabaseSettings:
        return DatabaseSettings()

    @property
    def redis(self) -> RedisSettings:
        return RedisSettings()

    @property
    def r2(self) -> R2Settings:
        return R2Settings()  # type: ignore[call-arg]

    @property
    def ai(self) -> AISettings:
        return AISettings()  # type: ignore[call-arg]

    @property
    def ocr(self) -> OCRSettings:
        return OCRSettings()

    @property
    def celery(self) -> CelerySettings:
        return CelerySettings()

    @field_validator("trusted_hosts")
    @classmethod
    def validate_trusted_hosts(cls, v: str) -> str:
        hosts = [h.strip() for h in v.split(",") if h.strip()]
        if not hosts:
            raise ValueError("At least one trusted host must be specified")
        return v

    @property
    def trusted_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.trusted_hosts.split(",") if h.strip()]

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
