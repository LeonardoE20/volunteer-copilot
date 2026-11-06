from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "volunteer-copilot"
    environment: str = "development"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    # Unset means Keenable's keyless tier, which is rate limited per IP.
    keenable_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
