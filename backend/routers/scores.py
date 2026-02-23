from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import DailyScore
from backend.schemas import DailyScoreResponse, ScoreHistoryResponse
from backend.services.scoring import classify_condition

router = APIRouter()


class ExposurePatch(BaseModel):
    exposure: float


@router.get("/latest", response_model=DailyScoreResponse)
def get_latest_scores(db: Session = Depends(get_db)):
    score = (
        db.query(DailyScore)
        .filter(DailyScore.recovery_score.isnot(None))
        .order_by(DailyScore.date.desc())
        .first()
    )
    if not score:
        raise HTTPException(404, "No scores found. Upload wearable data to get started.")
    return score


@router.patch("/today/exposure")
def patch_today_exposure(payload: ExposurePatch, db: Session = Depends(get_db)):
    today = date.today()
    score = db.query(DailyScore).filter(DailyScore.date == today).first()
    if not score:
        raise HTTPException(404, "No score row for today — sync Oura first.")
    score.exposure_score = round(payload.exposure, 1)
    score.condition = classify_condition(score.recovery_score, score.exposure_score, score.friction_score)
    db.commit()
    return {"date": today.isoformat(), "exposure_score": score.exposure_score, "condition": score.condition}


@router.get("/history", response_model=ScoreHistoryResponse)
def get_score_history(
    days: int = Query(default=14, ge=1, le=90),
    db: Session = Depends(get_db),
):
    cutoff = date.today() - timedelta(days=days)
    scores = (
        db.query(DailyScore)
        .filter(DailyScore.date >= cutoff)
        .order_by(DailyScore.date.asc())
        .all()
    )
    return ScoreHistoryResponse(entries=scores)
