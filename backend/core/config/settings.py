"""
core/config/settings.py
-----------------------
Centralised application settings loaded from environment variables.
Using pydantic-settings for type validation and IDE support.
"""
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    APP_NAME: str = "CDSS - Clinical Decision Support System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # ── Server ────────────────────────────────────────────────────────────────
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 1

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://cdss_user:cdss_password@localhost:5432/cdss_db"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # ── JWT Authentication ────────────────────────────────────────────────────
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_AT_LEAST_32_CHARS_LONG"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── File Storage ──────────────────────────────────────────────────────────
    UPLOAD_DIR: Path = Path("./uploads")
    MODELS_DIR: Path = Path("./models")
    REPORTS_DIR: Path = Path("./reports")
    GRADCAM_DIR: Path = Path("./gradcam")
    MAX_UPLOAD_SIZE_MB: int = 100

    # ── LLM Provider ──────────────────────────────────────────────────────────
    LLM_PROVIDER: str = "mock"          # openai | local | mock
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    LOCAL_LLM_URL: str = "http://localhost:11434"

    # ── Hospital ──────────────────────────────────────────────────────────────
    HOSPITAL_NAME: str = "General Hospital"
    HOSPITAL_ADDRESS: str = "123 Medical Drive"
    HOSPITAL_PHONE: str = "+1 (555) 000-0000"

    # ── CORS ──────────────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 60

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    def ensure_directories(self) -> None:
        """Create storage directories if they don't exist."""
        for directory in [
            self.UPLOAD_DIR,
            self.MODELS_DIR,
            self.REPORTS_DIR,
            self.GRADCAM_DIR,
        ]:
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings singleton.
    Use: from core.config.settings import get_settings; settings = get_settings()
    """
    settings = Settings()
    settings.ensure_directories()
    return settings
