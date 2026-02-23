import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import AppleHealthReading, Checkin, DailyScore, OuraReading
from backend.schemas import CheckinCreate, CheckinResponse
from backend.services.scoring import (
    classify_condition,
    compute_exposure_score,
    compute_friction_score,
    compute_recovery_score,
)

router = APIRouter()


def _get_recovery_for_date(db: Session, d: date) -> float | None:
    """Pull the most recent recovery score for a date from either wearable source."""
    oura = db.query(OuraReading).filter(OuraReading.date == d).first()
    if oura:
        return compute_recovery_score(
            source="oura",
            readiness_score=oura.readiness_score,
            hrv_avg=oura.hrv_avg,
            sleep_score=oura.sleep_score,
        )
    apple = db.query(AppleHealthReading).filter(AppleHealthReading.date == d).first()
    if apple:
        return compute_recovery_score(
            source="apple_health",
            sleep_hours=apple.sleep_hours,
            hrv_avg=apple.hrv_avg,
            resting_heart_rate=apple.resting_heart_rate,
        )
    return None


@router.post("", response_model=CheckinResponse)
def submit_checkin(payload: CheckinCreate, db: Session = Depends(get_db)):
    checkin = Checkin(
        date=payload.date,
        friction_rating=payload.friction_rating,
        note=payload.note,
    )
    db.add(checkin)
    db.flush()  # get checkin.id without committing

    # Recalculate daily score
    friction = compute_friction_score(payload.friction_rating)
    recovery = _get_recovery_for_date(db, payload.date)
    exposure = compute_exposure_score(None)
    condition = classify_condition(recovery, exposure, friction)

    sources = ["checkin"]
    if recovery is not None:
        oura = db.query(OuraReading).filter(OuraReading.date == payload.date).first()
        if oura:
            sources.insert(0, "oura")
        else:
            sources.insert(0, "apple_health")

    existing_score = (
        db.query(DailyScore).filter(DailyScore.date == payload.date).first()
    )
    if existing_score:
        existing_score.friction_score = friction
        existing_score.condition = condition
        existing_score.data_sources = json.dumps(sources)
    else:
        db.add(DailyScore(
            date=payload.date,
            recovery_score=recovery,
            exposure_score=exposure,
            friction_score=friction,
            condition=condition,
            data_sources=json.dumps(sources),
        ))

    db.commit()
    db.refresh(checkin)

    return CheckinResponse(
        checkin_id=checkin.id,
        date=checkin.date,
        friction_rating=checkin.friction_rating,
        recorded_at=checkin.recorded_at,
    )
