from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.database import Base, engine
from backend.routers import checkin, gcal_oauth, oura_oauth, scores, suggestions, upload

# Auto-create all tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Rhythm API",
    version="1.0.0",
    description="One backend for all Rhythm frontends.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/upload", tags=["upload"])
app.include_router(checkin.router, prefix="/checkin", tags=["checkin"])
app.include_router(scores.router, prefix="/scores", tags=["scores"])
app.include_router(suggestions.router, prefix="/suggestions", tags=["suggestions"])
app.include_router(oura_oauth.router, prefix="/oura", tags=["oura"])
app.include_router(gcal_oauth.router, prefix="/calendar", tags=["calendar"])


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "service": "rhythm"}
