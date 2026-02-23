from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import AppleHealthReading, DailyScore, OuraReading
from backend.schemas import UploadResponse
from backend.services.apple_health_parser import parse_apple_health_csv
from backend.services.oura_parser import parse_oura_csv
from backend.services.scoring import (
    classify_condition,
    compute_exposure_score,
    compute_friction_score,
    compute_recovery_score,
)

router = APIRouter()


def _upsert_daily_score(db: Session, row_date: date, source: str, reading: dict) -> None:
    """Recalculate and upsert daily_scores for the given date."""
    if source == "oura":
        recovery = compute_recovery_score(
            source=source,
            readiness_score=reading.get("readiness_score"),
            hrv_avg=reading.get("hrv_avg"),
            sleep_score=reading.get("sleep_score"),
        )
    else:
        recovery = compute_recovery_score(
            source=source,
            sleep_hours=reading.get("sleep_hours"),
            hrv_avg=reading.get("hrv_avg"),
            resting_heart_rate=reading.get("resting_heart_rate"),
        )

    # Check for existing checkin friction on this date
    from backend.models import Checkin
    checkin = (
        db.query(Checkin)
        .filter(Checkin.date == row_date)
        .order_by(Checkin.recorded_at.desc())
        .first()
    )
    friction = compute_friction_score(checkin.friction_rating if checkin else None)
    exposure = compute_exposure_score(None)
    condition = classify_condition(recovery, exposure, friction)

    import json
    sources = [source]
    if checkin:
        sources.append("checkin")

    existing = db.query(DailyScore).filter(DailyScore.date == row_date).first()
    if existing:
        existing.recovery_score = recovery
        existing.exposure_score = exposure
        existing.friction_score = friction
        existing.condition = condition
        existing.data_sources = json.dumps(sources)
    else:
        db.add(DailyScore(
            date=row_date,
            recovery_score=recovery,
            exposure_score=exposure,
            friction_score=friction,
            condition=condition,
            data_sources=json.dumps(sources),
        ))


@router.post("/oura", response_model=UploadResponse)
async def upload_oura(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(400, "Only .csv files are accepted.")

    content = await file.read()
    try:
        records = parse_oura_csv(content)
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    if not records:
        raise HTTPException(422, "No valid rows found in the uploaded file.")

    dates_seen: list[date] = []
    for row in records:
        row_date = row["date"]
        if not isinstance(row_date, date):
            continue

        existing = db.query(OuraReading).filter(OuraReading.date == row_date).first()
        fields = {
            "readiness_score": row.get("readiness_score"),
            "hrv_avg": row.get("hrv_avg"),
            "sleep_score": row.get("sleep_score"),
            "total_sleep_hours": row.get("total_sleep_hours"),
            "resting_heart_rate": row.get("resting_heart_rate"),
            "activity_score": row.get("activity_score"),
        }
        if existing:
            for k, v in fields.items():
                if v is not None:
                    setattr(existing, k, v)
        else:
            db.add(OuraReading(date=row_date, **fields))

        _upsert_daily_score(db, row_date, "oura", {**fields, "date": row_date})
        dates_seen.append(row_date)

    db.commit()

    dates_seen.sort()
    return UploadResponse(
        message="Oura data parsed and stored",
        rows_processed=len(dates_seen),
        date_range={
            "start": str(dates_seen[0]) if dates_seen else "",
            "end": str(dates_seen[-1]) if dates_seen else "",
        },
    )


@router.post("/apple-health", response_model=UploadResponse)
async def upload_apple_health(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(400, "Only .csv files are accepted.")

    content = await file.read()
    try:
        records = parse_apple_health_csv(content)
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    if not records:
        raise HTTPException(422, "No valid rows found in the uploaded file.")

    dates_seen: list[date] = []
    for row in records:
        row_date = row["date"]
        if not isinstance(row_date, date):
            continue

        existing = (
            db.query(AppleHealthReading)
            .filter(AppleHealthReading.date == row_date)
            .first()
        )
        fields = {
            "sleep_hours": row.get("sleep_hours"),
            "hrv_avg": row.get("hrv_avg"),
            "resting_heart_rate": row.get("resting_heart_rate"),
            "step_count": row.get("step_count"),
            "respiratory_rate": row.get("respiratory_rate"),
        }
        if existing:
            for k, v in fields.items():
                if v is not None:
                    setattr(existing, k, v)
        else:
            db.add(AppleHealthReading(date=row_date, **fields))

        _upsert_daily_score(db, row_date, "apple_health", {**fields, "date": row_date})
        dates_seen.append(row_date)

    db.commit()

    dates_seen.sort()
    return UploadResponse(
        message="Apple Health data parsed and stored",
        rows_processed=len(dates_seen),
        date_range={
            "start": str(dates_seen[0]) if dates_seen else "",
            "end": str(dates_seen[-1]) if dates_seen else "",
        },
    )
