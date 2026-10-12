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

    # Recommendation wording (pipeline/llm.py). The rules always produce a
    # complete sentence; the model only rephrases it, within these limits.
    recommendations_llm_enabled: bool = True
    llm_monthly_budget_usd: float = 20.0       # hard ceiling across all users, per calendar month (UTC)
    llm_user_daily_calls: int = 8              # per person, per UTC day
    llm_timeout_seconds: float = 6.0
    llm_max_output_tokens: int = 120
    # USD per million tokens, used to estimate and record cost. Set these to the
    # model's current published prices; the defaults are deliberately high.
    llm_price_input_per_mtok: float = 1.00
    llm_price_output_per_mtok: float = 4.00

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
    # Per-user Oura (F6). The redirect URI must be registered in the Oura
    # developer app; after the callback the browser returns to the app here.
    oura_v2_redirect_uri: str = "http://localhost:8000/connections/oura/callback"
    app_return_url: str = "rhythm://connections"
    oura_backfill_days: int = 30

    # Secrets generated locally (never committed). Fernet key for provider
    # tokens at rest; HMAC secret for OAuth state.
    token_encryption_key: str = ""
    oauth_state_secret: str = ""
    gcal_client_id: str = ""
    gcal_client_secret: str = ""
    gcal_redirect_uri: str = "http://localhost:8000/calendar/callback"


settings = Settings()
