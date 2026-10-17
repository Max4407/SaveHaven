from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "SaveHaven API"
    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./savehaven.db"
    frontend_origin: str = "http://localhost:5173"

    session_secret: SecretStr | None = None
    session_cookie_name: str = "savehaven_session"
    session_cookie_secure: bool = False
    session_max_age_seconds: int = 12 * 60 * 60

    nessie_api_key: SecretStr | None = None
    nessie_base_url: str = "https://prod-api.nessieisreal.com"
    nessie_data_mode: Literal["fixture", "live"] = "fixture"
    nessie_allow_fixture_fallback: bool = True
    demo_controls_enabled: bool = False
    nessie_timeout_seconds: float = 10.0
    nessie_fixture_path: Path = REPOSITORY_ROOT / "data" / "fixtures" / "nessie_profiles.json"
    town_catalog_path: Path = REPOSITORY_ROOT / "data" / "catalog" / "town_catalog.json"
    frontend_dist_path: Path = REPOSITORY_ROOT / "frontend" / "dist"

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.app_env == "production" and self.session_secret is None:
            raise ValueError("SESSION_SECRET is required in production")
        if self.app_env == "production" and not self.session_cookie_secure:
            raise ValueError("SESSION_COOKIE_SECURE must be true in production")
        if self.nessie_data_mode == "live" and self.nessie_api_key is None:
            raise ValueError("NESSIE_API_KEY is required when NESSIE_DATA_MODE=live")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
