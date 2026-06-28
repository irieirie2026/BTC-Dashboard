"""IMF International Financial Statistics via DBnomics (annual USD buckets)."""

from __future__ import annotations

import time
from typing import Any

from macro_data.cache import cache_get, cache_set
from macro_data.liquidity_config import IFS_SERIES

_REQUEST_TIMEOUT = 60
_HEADERS = {"User-Agent": "BTC-MacroDrivers/2.0", "Accept": "application/json"}


def _fetch_ifs_annual(series_code: str, *, scale: float = 1.0, refresh: bool = False) -> dict[int, float]:
    cache_key = f"ifs:annual:{series_code}:{scale}"
    if not refresh:
        cached = cache_get(cache_key)
        if cached is not None:
            return {int(k): v for k, v in cached.items()}

    import requests

    url = f"https://api.db.nomics.world/v22/series/IMF/IFS/{series_code}"
    bucket: dict[int, float] = {}
    try:
        resp = requests.get(
            url,
            params={"observations": "1"},
            headers=_HEADERS,
            timeout=_REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            cache_set(cache_key, {})
            return {}
        payload = resp.json()
        docs = payload.get("series", {}).get("docs", [])
        if not docs:
            cache_set(cache_key, {})
            return {}
        periods = docs[0].get("period", [])
        values = docs[0].get("value", [])
        for p, v in zip(periods, values):
            if v is None:
                continue
            try:
                yr = int(str(p)[:4])
            except (TypeError, ValueError):
                continue
            try:
                bucket[yr] = float(v) * scale
            except (TypeError, ValueError):
                continue
        cache_set(cache_key, bucket)
        return bucket
    except Exception:
        cache_set(cache_key, {})
        return {}


def _country_keys(country: dict) -> list[str]:
    keys: list[str] = []
    for k in (country.get("id"), country.get("listId"), country.get("iso3")):
        if k and k not in keys:
            keys.append(k)
    return keys


def load_ifs_store(*, refresh: bool = False) -> dict[str, dict[str, dict[int, float]]]:
    """
    Returns {component: {country_key: {year: value_usd}}}.
    country_key matches country id, listId, or iso3 for lookup.
    """
    out: dict[str, dict[str, dict[int, float]]] = {
        "cb_balance_sheet": {},
        "broad_money": {},
        "fx_reserves": {},
    }
    for component, mappings in IFS_SERIES.items():
        comp_bucket = out.setdefault(component, {})
        for country_key, meta in mappings.items():
            series = meta["series"]
            scale = meta.get("scale", 1.0)
            years = _fetch_ifs_annual(series, scale=scale, refresh=refresh)
            if not years:
                continue
            keys = [country_key]
            for alias in meta.get("aliases") or []:
                if alias not in keys:
                    keys.append(alias)
            for key in keys:
                comp_bucket[key] = years
    return out


def ifs_lookup(
    store: dict[str, dict[str, dict[int, float]]],
    component: str,
    country: dict,
    year: int,
) -> float | None:
    comp = store.get(component) or {}
    for key in _country_keys(country):
        val = (comp.get(key) or {}).get(year)
        if val is not None:
            return val
    return None