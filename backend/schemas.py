import datetime as _dt
from typing import List, Optional

from pydantic import BaseModel, Field


# ── Upload ────────────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    message: str
    rows_processed: int
    date_range: dict


# ── Check-in ──────────────────────────────────────────────────────────────────

class CheckinCreate(BaseModel):
    date: _dt.date = Field(default_factory=_dt.date.today)
    friction_rating: int = Field(ge=1, le=10)
    note: Optional[str] = Field(default=None, max_length=300)


class CheckinResponse(BaseModel):
    checkin_id: int
    date: _dt.date
    friction_rating: int
    recorded_at: _dt.datetime

    class Config:
        from_attributes = True


# ── Scores ────────────────────────────────────────────────────────────────────

class DailyScoreResponse(BaseModel):
    date: _dt.date
    recovery_score: Optional[float]
    exposure_score: Optional[float]
    friction_score: Optional[float]
    condition: str
    computed_at: _dt.datetime

    class Config:
        from_attributes = True


class ScoreHistoryResponse(BaseModel):
    entries: List[DailyScoreResponse]


# ── Suggestions ───────────────────────────────────────────────────────────────

class SuggestionResponse(BaseModel):
    suggestion_id: int
    date: _dt.date
    condition: str
    recovery_score: Optional[float]
    exposure_score: Optional[float]
    friction_score: Optional[float]
    reflection: str
    bullets: List[str]
    generated_at: _dt.datetime

    class Config:
        from_attributes = True
