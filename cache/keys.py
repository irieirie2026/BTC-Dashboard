"""Consistent cache key builders."""

from __future__ import annotations

from cache.config import KEY_PREFIX


def _join(*parts: str) -> str:
    cleaned = [KEY_PREFIX]
    for p in parts:
        s = str(p).strip().replace(" ", "_")
        if s:
            cleaned.append(s)
    return ":".join(cleaned)


# --- Macro ---

def macro_wb_countries() -> str:
    return _join("macro", "wb", "countries")


def macro_wb_indicator(code: str, start_year: int, end_year: int | None = None) -> str:
    end = end_year if end_year is not None else "open"
    return _join("macro", "wb", "indicator", code, str(start_year), str(end))


def macro_imf_indicator(code: str, start_year: int, end_year: int) -> str:
    return _join("macro", "imf", code, str(start_year), str(end_year))


def macro_dbnomics(provider: str, dataset: str, pattern: str, start: int, end: int) -> str:
    return _join("macro", "dbn", provider, dataset, pattern, str(start), str(end))


def macro_hierarchy_store() -> str:
    return _join("macro", "hierarchy", "store", "v1")


def macro_liquidity_payload(year: int | str) -> str:
    return _join("macro", "liquidity", "payload", "v2", str(year))


def macro_liquidity_map(year: int | str) -> str:
    return _join("macro", "liquidity", "map", "v2", str(year))


def macro_global_payload(year: int | str) -> str:
    return _join("macro", "global", "payload", "v1", str(year))


# --- Bitcoin ---

def btc_series(metric_id: str) -> str:
    return _join("btc", "series", metric_id)


def btc_bundle(name: str, timespan: str, version: str = "v1") -> str:
    return _join("btc", "bundle", name, version, timespan)


def btc_fetcher(key: str) -> str:
    """Legacy fetcher keys (btc:bg:v2:…)."""
    if key.startswith(f"{KEY_PREFIX}:"):
        return key
    return _join("btc", "fetch", key)