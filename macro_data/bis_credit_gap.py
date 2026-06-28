"""
BIS credit-to-GDP gaps — private non-financial sector, all lenders, quarterly.

Source: BIS WS_CREDIT_GAP bulk CSV (HP-filter trend; gap = actual − trend).
"""

from __future__ import annotations

import csv
import io
import time
import zipfile
from typing import Any

from macro_data.cache import cache_get, cache_set
from macro_data.config import PROJECTION_END_YEAR

BIS_BULK_URL = "https://data.bis.org/static/bulk/WS_CREDIT_GAP_csv_flat.zip"
_CACHE_KEY = "bis:credit_gap:store"
_PAYLOAD_CACHE: dict[str, dict[str, Any]] = {}

_GAP_TYPE = "C: Credit-to-GDP gaps (actual-trend)"
_BORROWER = "P: Private non-financial sector"
_LENDERS = "A: All sectors"

# Liquidity entity id → BIS borrowers country column value.
BIS_ENTITY_MAP: dict[str, str] = {
    "US": "US: United States",
    "JP": "JP: Japan",
    "GB": "GB: United Kingdom",
    "DE": "DE: Germany",
    "FR": "FR: France",
    "IT": "IT: Italy",
    "ES": "ES: Spain",
    "NL": "NL: Netherlands",
    "CH": "CH: Switzerland",
    "CA": "CA: Canada",
    "AU": "AU: Australia",
    "CN": "CN: China",
    "IN": "IN: India",
    "BR": "BR: Brazil",
    "KR": "KR: Korea",
    "MX": "MX: Mexico",
    "RU": "RU: Russia",
    "SA": "SA: Saudi Arabia",
    "ZA": "ZA: South Africa",
    "TR": "TR: Türkiye",
    "ID": "ID: Indonesia",
    "PL": "PL: Poland",
    "SE": "SE: Sweden",
    "NO": "NO: Norway",
    "BE": "BE: Belgium",
    "AT": "AT: Austria",
    "IE": "IE: Ireland",
    "PT": "PT: Portugal",
    "FI": "FI: Finland",
    "DK": "DK: Denmark",
    "GR": "GR: Greece",
    "HU": "HU: Hungary",
    "CZ": "CZ: Czechia",
    "SG": "SG: Singapore",
    "HK": "HK: Hong Kong SAR",
    "MY": "MY: Malaysia",
    "TH": "TH: Thailand",
    "IL": "IL: Israel",
    "AR": "AR: Argentina",
    "CL": "CL: Chile",
    "CO": "CO: Colombia",
    "EMU": "XM: Euro area",
}

# Unweighted composite for global / advanced views (major liquidity blocks).
BIS_COMPOSITE_BLOCKS: dict[str, list[str]] = {
    "WLD": ["US", "JP", "EMU", "GB", "CN"],
    "ADV": ["US", "JP", "EMU", "GB", "CA", "AU", "CH"],
    "EM": ["CN", "IN", "BR", "MX", "RU", "ZA", "TR", "ID"],
}

CREDIT_GAP_METHODOLOGY = (
    "BIS credit-to-GDP gap = actual credit/GDP ratio minus HP-filter long-term trend "
    "(private non-financial sector, all lenders, quarterly). "
    "Positive gaps signal credit above trend; BIS considers gaps above ~10 pp as early warning."
)


def clear_bis_credit_gap_cache() -> None:
    _PAYLOAD_CACHE.clear()


def _download_bulk(*, refresh: bool = False) -> str:
    disk_key = "bis:credit_gap:csv"
    if not refresh:
        cached = cache_get(disk_key)
        if cached:
            return cached

    import requests

    resp = requests.get(
        BIS_BULK_URL,
        headers={"User-Agent": "BTC-MacroDrivers/2.0"},
        timeout=120,
    )
    resp.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        name = next(n for n in zf.namelist() if n.endswith(".csv"))
        text = zf.read(name).decode("utf-8", errors="replace")
    cache_set(disk_key, text)
    return text


def _load_store(*, refresh: bool = False) -> dict[str, list[dict]]:
    if not refresh:
        cached = cache_get(_CACHE_KEY)
        if cached is not None:
            return cached

    text = _download_bulk(refresh=refresh)
    reader = csv.reader(io.StringIO(text))
    next(reader, None)  # header

    store: dict[str, list[dict]] = {}
    for row in reader:
        if len(row) < 10 or row[0] != "dataflow":
            continue
        if row[5] != _BORROWER or row[6] != _LENDERS or row[7] != _GAP_TYPE:
            continue
        country = row[4]
        period = row[8]
        try:
            val = float(row[9])
        except (TypeError, ValueError):
            continue
        store.setdefault(country, []).append({"period": period, "gap": val})

    for pts in store.values():
        pts.sort(key=lambda p: p["period"])

    cache_set(_CACHE_KEY, store)
    return store


def _resolve_bis_key(entity_id: str) -> str | None:
    if entity_id in BIS_ENTITY_MAP:
        return BIS_ENTITY_MAP[entity_id]
    return None


def _composite_series(entity_id: str, store: dict[str, list[dict]]) -> list[dict]:
    keys = BIS_COMPOSITE_BLOCKS.get(entity_id, [])
    if not keys:
        return []

    by_period: dict[str, list[float]] = {}
    for eid in keys:
        bis_key = BIS_ENTITY_MAP.get(eid)
        if not bis_key:
            continue
        for pt in store.get(bis_key, []):
            by_period.setdefault(pt["period"], []).append(pt["gap"])

    points = []
    for period in sorted(by_period.keys()):
        vals = by_period[period]
        if not vals:
            continue
        points.append({"period": period, "gap": sum(vals) / len(vals)})
    return points


def _quarter_add(period: str, delta: int = 1) -> str:
    year = int(period[:4])
    quarter = int(period[-1])
    quarter += delta
    while quarter > 4:
        quarter -= 4
        year += 1
    while quarter < 1:
        quarter += 4
        year -= 1
    return f"{year}-Q{quarter}"


def _quarter_index(period: str) -> int:
    return int(period[:4]) * 4 + int(period[-1])


def project_credit_gap_series(
    points: list[dict],
    *,
    end_period: str | None = None,
) -> list[dict]:
    if not points:
        return points
    last_actual = next((p for p in reversed(points) if not p.get("projected")), points[-1])
    end_period = end_period or f"{PROJECTION_END_YEAR}-Q4"
    if _quarter_index(last_actual["period"]) >= _quarter_index(end_period):
        return points

    out = [dict(p) for p in points if not p.get("projected")]
    gap = float(last_actual["gap"])
    cur = last_actual["period"]
    while _quarter_index(cur) < _quarter_index(end_period):
        cur = _quarter_add(cur, 1)
        out.append(
            {
                "period": cur,
                "gap": gap,
                "projected": True,
                "methodology": "Flat carry-forward from latest BIS quarter (no forward BIS release).",
            }
        )
    return out


def get_credit_gap_series(
    entity_id: str,
    *,
    projection_end_year: int | None = None,
    refresh: bool = False,
) -> dict[str, Any] | None:
    cache_key = f"bis:gap:{entity_id}"
    now = time.time()
    if not refresh:
        cached = _PAYLOAD_CACHE.get(cache_key)
        if cached and now - cached["ts"] < 3 * 24 * 3600:
            return cached["data"]

    store = _load_store(refresh=refresh)
    bis_key = _resolve_bis_key(entity_id)
    composite = entity_id in BIS_COMPOSITE_BLOCKS

    if bis_key:
        points = list(store.get(bis_key, []))
        label = bis_key.split(": ", 1)[-1]
        method = "BIS direct"
    elif composite:
        points = _composite_series(entity_id, store)
        blocks = BIS_COMPOSITE_BLOCKS.get(entity_id, [])
        label = f"Composite ({', '.join(blocks)})"
        method = "BIS composite (unweighted mean)"
    else:
        return None

    if not points:
        return None

    actual_tail = points[-80:]
    latest_actual = next((p for p in reversed(actual_tail) if not p.get("projected")), actual_tail[-1])
    end_year = projection_end_year or PROJECTION_END_YEAR
    end_period = f"{end_year}-Q4"
    tail = project_credit_gap_series(actual_tail, end_period=end_period)
    tail = tail[-96:]
    has_projection = any(p.get("projected") for p in tail)
    latest = latest_actual
    prev_actual_idx = actual_tail.index(latest_actual) - 1 if latest_actual in actual_tail else -1
    prev = actual_tail[prev_actual_idx] if prev_actual_idx >= 0 else None
    chg = (latest["gap"] - prev["gap"]) if prev else None

    payload = {
        "entity": entity_id,
        "label": label,
        "unit": "pp GDP",
        "format": "pct",
        "frequency": "quarterly",
        "method": method,
        "methodology": CREDIT_GAP_METHODOLOGY,
        "points": tail,
        "hasProjection": has_projection,
        "projectionEndPeriod": end_period if has_projection else None,
        "latest": {
            "period": latest["period"],
            "gap": latest["gap"],
            "change": chg,
            "signal": _gap_signal(latest["gap"]),
        },
        "source": "BIS WS_CREDIT_GAP",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    _PAYLOAD_CACHE[cache_key] = {"ts": now, "data": payload}
    return payload


def _gap_signal(gap: float) -> str:
    if gap >= 10:
        return "above_trend_warning"
    if gap >= 2:
        return "above_trend"
    if gap <= -10:
        return "well_below_trend"
    if gap <= -2:
        return "below_trend"
    return "near_trend"