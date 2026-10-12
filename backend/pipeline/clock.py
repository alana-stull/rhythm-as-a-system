"""The request's "now". A dependency so tests can pin the clock."""
from __future__ import annotations

import datetime as dt


def get_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)
