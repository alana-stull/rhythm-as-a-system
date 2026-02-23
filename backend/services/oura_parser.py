"""
Oura Ring CSV parser.

Oura exports two CSV formats from the app:
  - Readiness: columns like 'date', 'score', 'hrv_balance', 'recovery_index'
  - Sleep: columns like 'bedtime_start', 'total', 'score', 'rmssd', 'hr_lowest'

This parser handles both formats (and their slight column-name variations)
and returns a list of normalized dicts keyed by date.
"""
from __future__ import annotations

import io
import logging
from datetime import date

import pandas as pd

logger = logging.getLogger(__name__)

# Column aliases: what Oura might name them → our internal name
READINESS_ALIASES: dict[str, str] = {
    "date":                "date",
    "summary_date":        "date",
    "score":               "readiness_score",
    "readiness_score":     "readiness_score",
    "hrv_balance":         "hrv_balance",
    "recovery_index":      "recovery_index",
    "resting_hr":          "resting_heart_rate",
    "hr_lowest":           "resting_heart_rate",
}

SLEEP_ALIASES: dict[str, str] = {
    "date":                "date",
    "summary_date":        "date",
    "bedtime_start":       "date",   # use date portion only
    "score":               "sleep_score",
    "sleep_score":         "sleep_score",
    "total":               "total_sleep_seconds",  # seconds → hours later
    "total_duration":      "total_sleep_seconds",
    "duration":            "total_sleep_seconds",
    "rmssd":               "hrv_avg",
    "average_hrv":         "hrv_avg",
    "hr_lowest":           "resting_heart_rate",
    "resting_heart_rate":  "resting_heart_rate",
}


def _rename_columns(df: pd.DataFrame, aliases: dict[str, str]) -> pd.DataFrame:
    """Rename df columns using alias mapping; drop unrecognized columns."""
    rename_map = {col: aliases[col] for col in df.columns if col in aliases}
    df = df.rename(columns=rename_map)
    keep = set(aliases.values())
    return df[[c for c in df.columns if c in keep]]


def _parse_date_col(series: pd.Series) -> pd.Series:
    """Coerce to date, extracting date portion from datetimes."""
    return pd.to_datetime(series, errors="coerce").dt.date


def parse_oura_csv(file_bytes: bytes) -> list[dict]:
    """
    Parse an Oura CSV export.

    Returns a list of dicts with keys:
        date, readiness_score, hrv_avg, sleep_score,
        total_sleep_hours, resting_heart_rate
    All numeric values are float | None.
    """
    text = file_bytes.decode("utf-8", errors="replace")
    try:
        df = pd.read_csv(io.StringIO(text))
    except Exception as exc:
        raise ValueError(f"Cannot parse CSV: {exc}") from exc

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    # Detect file type by checking which key columns are present
    is_sleep = any(c in df.columns for c in ("rmssd", "total", "bedtime_start", "total_duration"))
    aliases = SLEEP_ALIASES if is_sleep else READINESS_ALIASES

    df = _rename_columns(df, aliases)

    if "date" not in df.columns:
        raise ValueError("No recognizable date column found in Oura CSV.")

    df["date"] = _parse_date_col(df["date"])
    df = df.dropna(subset=["date"])
    df = df.drop_duplicates(subset=["date"], keep="last")

    # Convert seconds → hours for sleep total
    if "total_sleep_seconds" in df.columns:
        df["total_sleep_hours"] = pd.to_numeric(df["total_sleep_seconds"], errors="coerce") / 3600
        df = df.drop(columns=["total_sleep_seconds"])

    # Numeric coercion
    for col in df.columns:
        if col != "date":
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Sanity filters
    if "hrv_avg" in df.columns:
        df.loc[df["hrv_avg"] > 300, "hrv_avg"] = None
    if "resting_heart_rate" in df.columns:
        df.loc[df["resting_heart_rate"] > 220, "resting_heart_rate"] = None
    if "total_sleep_hours" in df.columns:
        df.loc[df["total_sleep_hours"] > 18, "total_sleep_hours"] = None
        df.loc[df["total_sleep_hours"] < 0, "total_sleep_hours"] = None

    records = df.where(pd.notna(df), None).to_dict(orient="records")
    logger.info("Oura parser: %d rows processed (is_sleep=%s)", len(records), is_sleep)
    return records
