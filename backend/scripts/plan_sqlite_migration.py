"""
Dry-run plan for moving the legacy SQLite data into the Supabase schema (F4).

Read-only: opens the credential-free archive copy with mode=ro after checking
its checksum against MANIFEST.json, transforms rows in memory, validates them
against the new schema's constraints, and prints a report. It never writes to
any database. The apply step is a later, separately approved milestone.

    .venv/bin/python -m backend.scripts.plan_sqlite_migration
    .venv/bin/python -m backend.scripts.plan_sqlite_migration --source PATH --manifest PATH
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path

ARCHIVE = Path.home() / "rhythm-archive" / "2026-10-10"
DEFAULT_SOURCE = ARCHIVE / "rhythm-2026-10-10-no-credentials.db"
DEFAULT_MANIFEST = ARCHIVE / "MANIFEST.json"
IMPORT_BATCH = "sqlite-legacy-2026-04-21"


@dataclass
class Plan:
    health_daily: list[dict] = field(default_factory=list)
    checkins: list[dict] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)
    not_migrated: dict[str, str] = field(default_factory=dict)


def _num(value, lo: float | None = None, hi: float | None = None, *, issue: list[str], where: str):
    """Finite number within range, else None (with a recorded issue)."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        issue.append(f"{where}: not a number ({value!r}); dropped")
        return None
    if not math.isfinite(f):
        issue.append(f"{where}: NaN/inf; dropped")
        return None
    if (lo is not None and f < lo) or (hi is not None and f > hi):
        issue.append(f"{where}: {f} outside [{lo}, {hi}]; dropped")
        return None
    return f


def oura_row_to_health_daily(row: dict, issues: list[str]) -> dict | None:
    where = f"oura_readings#{row['id']} ({row['date']})"
    hrv = _num(row.get("hrv_avg"), 0.01, 500, issue=issues, where=f"{where} hrv")
    sleep_h = _num(row.get("total_sleep_hours"), 0, 24, issue=issues, where=f"{where} sleep")
    out = {
        "source": "oura",
        "local_date": dt.date.fromisoformat(str(row["date"])[:10]),
        "readiness": _num(row.get("readiness_score"), 0, 100, issue=issues, where=f"{where} readiness"),
        "sleep_minutes": round(sleep_h * 60) if sleep_h is not None else None,
        "hrv_ms": hrv,
        "hrv_method": "rmssd" if hrv is not None else None,  # Oura reports RMSSD
        "resting_hr": _num(row.get("resting_heart_rate"), 20, 250, issue=issues, where=f"{where} resting_hr"),
        "source_record_id": f"sqlite:oura_readings:{row['id']}",
        "import_batch": IMPORT_BATCH,
    }
    if all(out[k] is None for k in ("readiness", "sleep_minutes", "hrv_ms", "resting_hr")):
        issues.append(f"{where}: no usable values; skipped")
        return None
    return out


def checkin_row_to_checkin(row: dict, issues: list[str]) -> dict | None:
    where = f"checkins#{row['id']} ({row['date']})"
    rating = _num(row.get("friction_rating"), 1, 10, issue=issues, where=f"{where} friction")
    if rating is None:
        issues.append(f"{where}: no valid rating; skipped")
        return None
    recorded = dt.datetime.fromisoformat(str(row["recorded_at"]))
    if recorded.tzinfo is None:  # SQLite func.now() stores UTC without an offset
        recorded = recorded.replace(tzinfo=dt.timezone.utc)
    note = row.get("note")
    return {
        "local_date": dt.date.fromisoformat(str(row["date"])[:10]),
        "recorded_at": recorded,
        "legacy_friction": int(rating),  # retired scale: kept as history, never fed to the engine
        "note": note[:1000] if note else None,
        "source": "legacy_import",
    }


def build_plan(conn: sqlite3.Connection) -> Plan:
    conn.row_factory = sqlite3.Row
    plan = Plan()
    for row in conn.execute("select * from oura_readings order by date"):
        mapped = oura_row_to_health_daily(dict(row), plan.issues)
        if mapped:
            plan.health_daily.append(mapped)
    for row in conn.execute("select * from checkins order by recorded_at"):
        mapped = checkin_row_to_checkin(dict(row), plan.issues)
        if mapped:
            plan.checkins.append(mapped)
    counts = {t: conn.execute(f"select count(*) from {t}").fetchone()[0]
              for t in ("apple_health_readings", "daily_scores", "suggestions", "oura_tokens", "gcal_tokens")}
    plan.not_migrated = {
        "daily_scores": f"{counts['daily_scores']} rows: recomputed by engine v2 instead of copied (retired formulas and labels)",
        "suggestions": f"{counts['suggestions']} rows: tied to retired scores; stay in the archive (decision pending)",
        "oura_tokens/gcal_tokens": f"{counts['oura_tokens'] + counts['gcal_tokens']} rows in this copy: credentials are never migrated; reconnect through the new per-user flow",
        "apple_health_readings": f"{counts['apple_health_readings']} rows",
        "oura sleep_score/activity_score": "not used by engine v2; preserved in the archive and CSV",
    }
    return plan


def verify_checksum(source: Path, manifest: Path) -> None:
    expected = json.loads(manifest.read_text())["files"][source.name]["sha256_file"]
    actual = hashlib.sha256(source.read_bytes()).hexdigest()
    if actual != expected:
        raise SystemExit(f"Checksum mismatch for {source.name}: archive copy changed; refusing to plan.")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    ap.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = ap.parse_args(argv)

    verify_checksum(args.source, args.manifest)
    with sqlite3.connect(f"file:{args.source}?mode=ro", uri=True) as conn:
        plan = build_plan(conn)

    dates = [r["local_date"] for r in plan.health_daily]
    print("Dry run only. Nothing was written anywhere.\n")
    print(f"health_daily (source=oura): {len(plan.health_daily)} rows"
          + (f", {min(dates)} to {max(dates)}" if dates else ""))
    for k in ("readiness", "sleep_minutes", "hrv_ms", "resting_hr"):
        print(f"  with {k}: {sum(r[k] is not None for r in plan.health_daily)}")
    print(f"checkins (legacy_friction history): {len(plan.checkins)} rows")
    print("\nNot migrated:")
    for k, v in plan.not_migrated.items():
        print(f"  {k}: {v}")
    print(f"\nIssues ({len(plan.issues)}):")
    for issue in plan.issues[:25]:
        print(f"  {issue}")
    if len(plan.issues) > 25:
        print(f"  … {len(plan.issues) - 25} more")
    return 0


if __name__ == "__main__":
    sys.exit(main())
