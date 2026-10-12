from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.database import Base, engine
from backend.routers import (
    areas, checkin, checkins, connections, gcal_oauth, insights, lamp, me, oura_oauth, plan, scores, suggestions,
    tasks, today, upload, you,
)

# Legacy SQLite tables only. The Supabase schema is managed by Alembic (backend/migrations).
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
app.include_router(lamp.router, prefix="/lamp", tags=["lamp"])
app.include_router(me.router, prefix="/me", tags=["me"])
# F3: Supabase-backed endpoints (authenticated, per-user)
app.include_router(today.router, prefix="/today", tags=["today"])
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
app.include_router(areas.router, prefix="/areas", tags=["areas"])
app.include_router(checkins.router, prefix="/checkins", tags=["checkins"])
app.include_router(connections.router, prefix="/connections", tags=["connections"])
app.include_router(plan.router, prefix="/plan", tags=["plan"])
app.include_router(insights.router, prefix="/insights", tags=["insights"])
app.include_router(you.router, tags=["you"])

@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "service": "rhythm"}
