"""FRED public CSV export — no API key required."""

from __future__ import annotations

import csv
import io
import threading
import urllib.error
import urllib.request

from macro_data.cache import cache_get, cache_set

_HEADERS = {
    "User-Agent": "BTC-MacroDrivers/2.0",
    "Accept": "text/csv,text/plain,*/*",
}
# One FRED download at a time. This host resets overlapping HTTP/2 streams.
_FETCH_LOCK = threading.Lock()
_LAST_ERROR: dict[str, str] = {}

_URLS = (
    "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}",
    "https://fred.stlouisfed.org/series/{series}/downloaddata/{series}.csv",
)


def fred_last_error(series_id: str) -> str | None:
    return _LAST_ERROR.get(series_id)


def _parse_fred_csv(text: str, series_id: str) -> list[tuple[str, float]]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return []
    fields = [name.strip() for name in reader.fieldnames if name]
    date_key = next(
        (name for name in fields if name.lower() in ("observation_date", "date")),
        fields[0],
    )
    value_key = next(
        (name for name in fields if name.upper() == series_id.upper()),
        None,
    )
    if value_key is None:
        value_key = next((name for name in fields if name != date_key), None)
    out: list[tuple[str, float]] = []
    for row in reader:
        if not row:
            continue
        date = (row.get(date_key) or "").strip()
        raw = (row.get(value_key) or "").strip() if value_key else ""
        if not date or not raw or raw == ".":
            continue
        try:
            out.append((date[:10], float(raw)))
        except ValueError:
            continue
    return out


def _fetch_one(url: str) -> str:
    # urllib speaks HTTP/1.1. curl's HTTP/2 to this host is reset before a body.
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read().decode("utf-8", errors="replace")


def fetch_fred_csv(series_id: str, *, refresh: bool = False) -> list[tuple[str, float]]:
    """
    Returns ascending (YYYY-MM-DD, value) pairs for a FRED series.
    Only a non-empty parse is cached. Failures return [] and do not write the cache.
    """
    cache_key = f"fred:csv:{series_id}"
    if not refresh:
        cached = cache_get(cache_key)
        # Empty lists were previously cached on failure — treat them as a miss.
        if cached:
            _LAST_ERROR.pop(series_id, None)
            return [(row[0], float(row[1])) for row in cached]

    last_error = "FRED returned no observations"
    out: list[tuple[str, float]] = []
    with _FETCH_LOCK:
        for template in _URLS:
            url = template.format(series=series_id)
            try:
                text = _fetch_one(url).strip()
            except urllib.error.HTTPError as exc:
                last_error = f"FRED HTTP {exc.code} for {series_id}"
                continue
            except Exception as exc:
                last_error = f"FRED fetch failed for {series_id}: {type(exc).__name__}: {exc}"
                continue
            if not text or text.startswith("<!DOCTYPE") or text.lower().startswith("<html"):
                last_error = f"FRED returned HTML instead of CSV for {series_id}"
                continue
            parsed = _parse_fred_csv(text, series_id)
            if parsed:
                out = parsed
                break
            last_error = f"FRED CSV for {series_id} had no numeric observations"

    if not out:
        _LAST_ERROR[series_id] = last_error[:240]
        return []
    _LAST_ERROR.pop(series_id, None)
    try:
        cache_set(cache_key, out)
    except Exception:
        pass
    return out
