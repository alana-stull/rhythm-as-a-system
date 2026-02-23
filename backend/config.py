from pydantic_settings import BaseSettings


class Settings(BaseSettings):
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

    class Config:
        env_file = ".env"


settings = Settings()
