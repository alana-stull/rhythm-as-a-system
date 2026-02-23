from __future__ import annotations  # needed for SQLAlchemy 2.0 Mapped[] on Python 3.10

from datetime import date, datetime
from sqlalchemy import Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class OuraReading(Base):
    __tablename__ = "oura_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[date] = mapped_column(Date, unique=True, index=True, nullable=False)
    readiness_score: Mapped[float | None] = mapped_column(Float)
    hrv_avg: Mapped[float | None] = mapped_column(Float)
    sleep_score: Mapped[float | None] = mapped_column(Float)
    total_sleep_hours: Mapped[float | None] = mapped_column(Float)
    resting_heart_rate: Mapped[float | None] = mapped_column(Float)
    activity_score: Mapped[float | None] = mapped_column(Float)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AppleHealthReading(Base):
    __tablename__ = "apple_health_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[date] = mapped_column(Date, unique=True, index=True, nullable=False)
    sleep_hours: Mapped[float | None] = mapped_column(Float)
    hrv_avg: Mapped[float | None] = mapped_column(Float)
    resting_heart_rate: Mapped[float | None] = mapped_column(Float)
    step_count: Mapped[int | None] = mapped_column(Integer)
    respiratory_rate: Mapped[float | None] = mapped_column(Float)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Checkin(Base):
    __tablename__ = "checkins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    friction_rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-10
    note: Mapped[str | None] = mapped_column(Text)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class DailyScore(Base):
    __tablename__ = "daily_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[date] = mapped_column(Date, unique=True, index=True, nullable=False)
    recovery_score: Mapped[float | None] = mapped_column(Float)
    exposure_score: Mapped[float | None] = mapped_column(Float)
    friction_score: Mapped[float | None] = mapped_column(Float)
    condition: Mapped[str] = mapped_column(String(20), nullable=False)
    data_sources: Mapped[str] = mapped_column(Text, default="[]")  # JSON array
    computed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class GoogleCalToken(Base):
    __tablename__ = "gcal_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    token_type: Mapped[str] = mapped_column(String(50), default="Bearer")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class OuraToken(Base):
    __tablename__ = "oura_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    token_type: Mapped[str] = mapped_column(String(50), default="Bearer")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Suggestion(Base):
    __tablename__ = "suggestions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    condition: Mapped[str] = mapped_column(String(20), nullable=False)
    recovery_score: Mapped[float | None] = mapped_column(Float)
    exposure_score: Mapped[float | None] = mapped_column(Float)
    friction_score: Mapped[float | None] = mapped_column(Float)
    reflection: Mapped[str] = mapped_column(Text, nullable=False)
    bullets: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array
    generated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
