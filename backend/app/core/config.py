from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "volunteer-copilot"
    environment: str = "development"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    # Unset means Keenable's keyless tier, which is rate limited per IP.
    keenable_api_key: str | None = None
    # Chert Messaging API secret, sent as a bearer token. Sending fails until it is set.
    chert_signing_secret: str | None = None
    # Secret of the Chert webhook subscription. The reply webhook refuses events until it is set.
    chert_webhook_secret: str | None = None
    # The default is the Supabase CLI's local database (`supabase start`).
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, url: str) -> str:
        # Supabase hands out postgresql:// URLs, which SQLAlchemy would map to psycopg2.
        for scheme in ("postgresql://", "postgres://"):
            if url.startswith(scheme):
                return "postgresql+psycopg://" + url.removeprefix(scheme)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
