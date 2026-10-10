from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent

# backend/.env is the canonical location. The repo-root .env is still read
# (with lower priority) until its values have been moved over.
_ENV_FILES = (_BACKEND_DIR.parent / ".env", _BACKEND_DIR / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILES, extra="ignore")

    openai_api_key: str = ""
    interpretation_model: str = "gpt-4.1-mini"

    # Supabase Postgres for the user-owned schema (Alembic, backend/migrations).
    # postgresql+psycopg://... ; empty means not configured (those endpoints return 503).
    database_url: str = ""
    # The pre-Supabase single-user SQLite database used by the legacy endpoints
    # until F3/F4 replace them. Never migrated in place.
    legacy_database_url: str = "sqlite:///./rhythm.db"

    # Supabase Auth. JWTs are verified against {supabase_url}/auth/v1 JWKS
    # (signing keys). supabase_jwt_secret is only for projects still on the
    # legacy shared HS256 secret; leave empty otherwise.
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
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
