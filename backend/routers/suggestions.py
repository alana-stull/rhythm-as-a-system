import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import DailyScore, Suggestion
from backend.schemas import SuggestionResponse
from backend.services.openai_service import generate_suggestion

router = APIRouter()


def _score_to_response(suggestion: Suggestion) -> SuggestionResponse:
    return SuggestionResponse(
        suggestion_id=suggestion.id,
        date=suggestion.date,
        condition=suggestion.condition,
        recovery_score=suggestion.recovery_score,
        exposure_score=suggestion.exposure_score,
        friction_score=suggestion.friction_score,
        reflection=suggestion.reflection,
        bullets=json.loads(suggestion.bullets),
        generated_at=suggestion.generated_at,
    )


@router.post("/generate", response_model=SuggestionResponse)
def generate(db: Session = Depends(get_db)):
    # Pull latest available scores
    score = (
        db.query(DailyScore)
        .order_by(DailyScore.date.desc())
        .first()
    )
    if not score:
        raise HTTPException(404, "No scores found. Upload wearable data first.")

    if not score.recovery_score:
        raise HTTPException(422, "Recovery score is required to generate a suggestion.")

    try:
        reflection, bullets = generate_suggestion(
            recovery=score.recovery_score,
            exposure=score.exposure_score,
            friction=score.friction_score,
            condition=score.condition,
            today=score.date,
        )
    except Exception as exc:
        raise HTTPException(502, f"AI generation failed: {exc}")

    suggestion = Suggestion(
        date=score.date,
        condition=score.condition,
        recovery_score=score.recovery_score,
        exposure_score=score.exposure_score,
        friction_score=score.friction_score,
        reflection=reflection,
        bullets=json.dumps(bullets),
    )
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)

    return _score_to_response(suggestion)


@router.get("/latest", response_model=SuggestionResponse)
def get_latest_suggestion(db: Session = Depends(get_db)):
    suggestion = (
        db.query(Suggestion)
        .order_by(Suggestion.generated_at.desc())
        .first()
    )
    if not suggestion:
        raise HTTPException(
            404,
            "No suggestion yet. Upload wearable data then POST /suggestions/generate.",
        )
    return _score_to_response(suggestion)
