from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings

_BOOTSTRAP_TOKEN_MIN_CHARS = 32


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    REFRESH_TOKEN_EXPIRE_DAYS: int
    BOOTSTRAP_ADMIN_TOKEN: str
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: int
    AUTH_RATE_LIMIT_WINDOW_SECONDS: int
    RATE_LIMIT_WINDOW_SECONDS: int
    RATE_LIMIT_MAX_PER_IP: int
    RATE_LIMIT_MAX_PER_USER: int
    PRODUCTS_MAX_PAGE_SIZE: int
    ANALYTICS_MAX_RANGE_DAYS: int
    REDIS_URL: str
    TTL_PRODUCTS_LIST: int
    TTL_CATEGORIES: int
    TTL_ORDERS_LIST: int
    TTL_USER: int
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    REDIS_PASSWORD: str
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_BUCKET: str
    MAX_UPLOAD_SIZE: int
    ALLOWED_IMAGE_TYPES: str
    TRUSTED_PROXIES: list[str]
    CORS_ORIGINS: list[str] 
    ENV: Literal["development", "production"]

    
    @field_validator("BOOTSTRAP_ADMIN_TOKEN")
    @classmethod
    def _validate_bootstrap_token_entropy(cls, v: str) -> str:
        if len(v) < _BOOTSTRAP_TOKEN_MIN_CHARS:
            raise ValueError(
                f"BOOTSTRAP_ADMIN_TOKEN deve ter pelo menos {_BOOTSTRAP_TOKEN_MIN_CHARS} "
                "caracteres para garantir entropia suficiente."
            )
        return v

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    class Config:
        env_file = ".env"


settings = Settings()

