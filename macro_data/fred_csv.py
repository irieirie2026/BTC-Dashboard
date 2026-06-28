"""FRED public CSV export — no API key required."""

from __future__ import annotations

import csv
import io
from typing import Any

from macro_data.cache import cache_get, cache_set

_HEADERS = {"User-Agent": "BTC-MacroDrivers/2.0"}
_FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv"


def fetch_fred_csv(series_id: str, *, refresh: bool = False) -> list[tuple[str, float]]:
    """
    Returns ascending (YYYY-MM-DD, value) pairs for a FRED series.
    Cached on disk via macro_data.cache.
    """
    cache_key = f"fred:csv:{series_id}"
    if not refresh:
        cached = cache_get(cache_key)
        if cached is not None:
            return [(row[0], float(row[1])) for row in cached]

    import requests

    url = f"{_FRED_CSV}?id={series_id}"
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=60)
        if resp.status_code != 200:
            cache_set(cache_key, [])
            return []
        text = resp.text.strip()
        if not text or text.startswith("<!DOCTYPE"):
            cache_set(cache_key, [])
            return []
        reader = csv.DictReader(io.StringIO(text))
        out: list[tuple[str, float]] = []
        for row in reader:
            date = (row.get("observation_date") or "").strip()
            raw = (row.get(series_id) or row.get(list(row.keys())[-1] if row else "") or "").strip()
            if not date or not raw or raw == ".":
                continue
            try:
                out.append((date, float(raw)))
            except ValueError:
                continue
        cache_set(cache_key, out)
        return out
    except Exception:
        cache_set(cache_key, [])
        return []