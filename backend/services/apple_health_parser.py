"""
Apple Health CSV parser.

Apple Health exports data via the Health app as export.xml, but many
third-party apps (e.g. "Health Auto Export", "QS Access") produce CSV files.
This parser handles the most common CSV formats from those exporters.
"""
from __future__ import annotations

import io
import logging
from datetime import date

import pandas as pd

logger = logging.getLogger(__name__)

# Maps common column name variations → our internal names
COLUMN_ALIASES: dict[str, str] = {
    # Date columns
    "date":                             "date",
    "start_date":                       "date",
    "startdate":                        "date",
    "creation_date":                    "date",

    # Sleep
    "sleep_analysis_(hr)":              "sleep_hours",
    "sleep_analysis_(hours)":           "sleep_hours",
    "sleep_duration":                   "sleep_hours",
    "in_bed_(hr)":                      "sleep_hours",
    "asleep_(hr)":                      "sleep_hours",
    "sleep_hours":                      "sleep_hours",
    "sleepanalysis":                    "sleep_hours",

    # HRV
    "heart_rate_variability_(ms)":      "hrv_avg",
    "hrv_(ms)":                         "hrv_avg",
    "hrv":                              "hrv_avg",
    "heart_rate_variability_sdnn_(ms)": "hrv_avg",
    "heartratevariabilitysdnn":         "hrv_avg",

    # Resting Heart Rate
    "resting_heart_rate_(bpm)":         "resting_heart_rate",
    "resting_heart_rate":               "resting_heart_rate",
    "restingheartrate":                 "resting_heart_rate",

    # Steps
    "step_count":                       "step_count",
    "stepcount":                        "step_count",
    "steps":                            "step_count",

    # Respiratory Rate
    "respiratory_rate_(count/min)":     "respiratory_rate",
    "respiratory_rate":                 "respiratory_rate",
    "respiratoryrate":                  "respiratory_rate",
}

KEEP_COLUMNS = {
    "date", "sleep_hours", "hrv_avg",
    "resting_heart_rate", "step_count", "respiratory_rate",
}


def parse_apple_health_csv(file_bytes: bytes) -> list[dict]:
    """
    Parse an Apple Health CSV export.

    Returns a list of dicts with keys:
        date, sleep_hours, hrv_avg, resting_heart_rate,
        step_count, respiratory_rate
    All numeric values are float | None.
    """
    text = file_bytes.decode("utf-8", errors="replace")
    try:
        df = pd.read_csv(io.StringIO(text))
    except Exception as exc:
        raise ValueError(f"Cannot parse CSV: {exc}") from exc

    # Normalize column names: lowercase, strip, replace spaces with underscores
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    rename_map = {col: COLUMN_ALIASES[col] for col in df.columns if col in COLUMN_ALIASES}
    df = df.rename(columns=rename_map)
    df = df[[c for c in df.columns if c in KEEP_COLUMNS]]

    if "date" not in df.columns:
        raise ValueError("No recognizable date column found in Apple Health CSV.")

    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    df = df.dropna(subset=["date"])

    # If multiple rows per date (per-segment sleep), aggregate by date
    if df.duplicated(subset=["date"]).any():
        agg: dict[str, str] = {}
        for col in df.columns:
            if col == "date":
                continue
            if col == "sleep_hours":
                agg[col] = "sum"   # total sleep across segments
            elif col == "step_count":
                agg[col] = "sum"
            else:
                agg[col] = "mean"  # average HRV, RHR, etc.
        df = df.groupby("date", as_index=False).agg(agg)

    # Numeric coercion
    for col in df.columns:
        if col != "date":
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Sanity filters
    if "hrv_avg" in df.columns:
        df.loc[df["hrv_avg"] > 300, "hrv_avg"] = None
    if "resting_heart_rate" in df.columns:
        df.loc[df["resting_heart_rate"] > 220, "resting_heart_rate"] = None
    if "sleep_hours" in df.columns:
        df.loc[df["sleep_hours"] > 18, "sleep_hours"] = None
        df.loc[df["sleep_hours"] < 0, "sleep_hours"] = None

    records = df.where(pd.notna(df), None).to_dict(orient="records")
    logger.info("Apple Health parser: %d rows processed", len(records))
    return records
