from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent

# backend/.env is the canonical location. The repo-root .env is still read
# (with lower priority) until its values have been moved over.
_ENV_FILES = (_BACKEND_DIR.parent / ".env", _BACKEND_DIR / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILES, extra="ignore")

    google_api_key: str = ""
    database_url: str = "sqlite:///./rhythm.db"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:4173",
    ]
    oura_client_id: str = ""
    oura_client_secret: str = ""
    oura_redirect_uri: str = "http://localhost:8000/oura/callback"
    gcal_client_id: str = ""
    gcal_client_secret: str = ""
    gcal_redirect_uri: str = "http://localhost:8000/calendar/callback"


settings = Settings()
