from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_INSECURE_DEFAULT_SECRET = "dev-only-insecure-secret-change-me-0123456789abcdef"


def _split_csv(value: object) -> object:
    """Accept both JSON lists and comma separated strings for list settings."""
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("["):
            import json

            return json.loads(stripped)
        return [item.strip() for item in stripped.split(",") if item.strip()]
    return value


class Settings(BaseSettings):
    """Application settings.

    Every value has a development default so `uvicorn app.main:app` works out of the box
    against the docker-compose services. Production refuses to boot with insecure defaults.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ENV: Literal["development", "test", "production"] = "development"
    APP_NAME: str = "Lux Delivery API"
    APP_VERSION: str = "3.0.0"
    API_PREFIX: str = "/api/v1"
    LOG_LEVEL: str = "INFO"
    LOG_JSON: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://lux:lux@localhost:5433/lux_delivery"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 10
    # Fail fast when the pool is exhausted (answered as 503 + Retry-After, see core/errors.py).
    DB_POOL_TIMEOUT_SECONDS: int = 5
    DB_STATEMENT_TIMEOUT_MS: int = 5000
    DB_ECHO: bool = False
    # Optional read replica for lag-tolerant, heavy reads (analytics). Unset = use the primary.
    DATABASE_READ_URL: str | None = None
    # PgBouncer in transaction mode does not support server-side prepared statements.
    DB_BEHIND_PGBOUNCER: bool = False

    # Redis
    REDIS_URL: str = "redis://localhost:6380/0"
    REDIS_MAX_CONNECTIONS: int = 100
    REDIS_POOL_TIMEOUT_SECONDS: float = 2.0

    # Auth
    SECRET_KEY: str = _INSECURE_DEFAULT_SECRET
    JWT_ALGORITHM: Literal["HS256", "HS384", "HS512"] = "HS256"
    JWT_ISSUER: str = "lux-delivery"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    # Two tabs refreshing at the same time is not an attack: within this window the reuse of a
    # just-rotated token is rejected without revoking the whole token family.
    REFRESH_REUSE_GRACE_SECONDS: int = 10
    BCRYPT_ROUNDS: int = 12
    BOOTSTRAP_ADMIN_TOKEN: str | None = None
    COOKIE_DOMAIN: str | None = None
    USER_STATUS_CACHE_TTL: int = 300

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    RATE_LIMIT_MAX_PER_IP: int = 300
    RATE_LIMIT_MAX_PER_USER: int = 600
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: int = 10
    AUTH_RATE_LIMIT_WINDOW_SECONDS: int = 60
    LOGIN_MAX_ATTEMPTS_PER_ACCOUNT: int = 10
    LOGIN_ACCOUNT_WINDOW_SECONDS: int = 900

    # HTTP
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    TRUSTED_PROXIES: Annotated[list[str], NoDecode] = ["127.0.0.1"]
    MAX_PAGE_SIZE: int = 100
    # Load shedding: max concurrent (non-SSE) requests per process; 0 disables.
    MAX_IN_FLIGHT_REQUESTS: int = 200

    # Cache TTLs (seconds)
    TTL_CATALOG: int = 300
    TTL_ANALYTICS: int = 60

    # Storage
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    MEDIA_ROOT: str = "./media"
    MEDIA_URL: str = "/media"
    S3_BUCKET: str = "lux-media"
    S3_ENDPOINT_URL: str | None = None
    S3_REGION: str = "us-east-1"
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None
    S3_PUBLIC_BASE_URL: str | None = None
    MAX_UPLOAD_SIZE: int = 5 * 1024 * 1024

    # Business
    BUSINESS_TIMEZONE: str = "America/Sao_Paulo"
    ANALYTICS_MAX_RANGE_DAYS: int = 366
    IDEMPOTENCY_KEY_TTL_HOURS: int = 24

    # Events / worker
    EVENTS_STREAM: str = "lux:events"
    EVENTS_STREAM_MAXLEN: int = 100_000
    OUTBOX_BATCH_SIZE: int = 100
    OUTBOX_POLL_INTERVAL_SECONDS: float = 1.0
    CONSUMER_MAX_DELIVERIES: int = 5
    WORKER_METRICS_PORT: int = 9101

    # Realtime
    SSE_HEARTBEAT_SECONDS: int = 15

    # Observability
    METRICS_ENABLED: bool = True
    METRICS_TOKEN: str | None = None

    @field_validator(
        "BOOTSTRAP_ADMIN_TOKEN",
        "DATABASE_READ_URL",
        "METRICS_TOKEN",
        "COOKIE_DOMAIN",
        "S3_ENDPOINT_URL",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "S3_PUBLIC_BASE_URL",
        mode="before",
    )
    @classmethod
    def _empty_is_none(cls, value: object) -> object:
        # Compose/k8s render unset variables as "": an empty optional secret means "disabled".
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("CORS_ORIGINS", "TRUSTED_PROXIES", mode="before")
    @classmethod
    def _parse_list(cls, value: object) -> object:
        return _split_csv(value)

    @model_validator(mode="after")
    def _guard_production(self) -> "Settings":
        if self.ENV != "production":
            return self
        problems: list[str] = []
        if self.SECRET_KEY == _INSECURE_DEFAULT_SECRET or len(self.SECRET_KEY) < 32:
            problems.append("SECRET_KEY must be set to a random value with at least 32 chars")
        if self.BOOTSTRAP_ADMIN_TOKEN is not None and len(self.BOOTSTRAP_ADMIN_TOKEN) < 32:
            problems.append("BOOTSTRAP_ADMIN_TOKEN must have at least 32 chars")
        if "*" in self.CORS_ORIGINS:
            problems.append("CORS_ORIGINS cannot contain '*' with credentialed requests")
        if problems:
            raise ValueError("; ".join(problems))
        return self

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    @property
    def cookie_secure(self) -> bool:
        return self.is_production


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
