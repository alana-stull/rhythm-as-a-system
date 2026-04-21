from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json

from backend.database import get_db
from backend.models import DailyScore, Suggestion

router = APIRouter()

@router.get("")
def get_lamp_state(db: Session = Depends(get_db)):
    # Get today's score
    score = (
        db.query(DailyScore)
        .filter(DailyScore.date == date.today())
        .first()
    )
    if not score:
        # Fall back to most recent if today isn't synced yet
        score = (
            db.query(DailyScore)
            .filter(DailyScore.recovery_score.isnot(None))
            .order_by(DailyScore.date.desc())
            .first()
        )
    if not score:
        raise HTTPException(404, "No score data available. Sync Oura first.")

    # Get latest suggestion text for audio
    suggestion = (
        db.query(Suggestion)
        .order_by(Suggestion.generated_at.desc())
        .first()
    )
    recommendation = ""
    if suggestion:
        bullets = json.loads(suggestion.bullets or "[]")
        recommendation = suggestion.reflection
        if bullets:
            recommendation += " " + bullets[0]

    return {
        "state":          score.condition.lower(),  # "aligned", "balanced", etc.
        "recommendation": recommendation,
        "recovery":       score.recovery_score,
        "exposure":       score.exposure_score,
        "date":           score.date.isoformat(),
    }