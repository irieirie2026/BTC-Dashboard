"""BGeometrics adapter."""

from __future__ import annotations

from btc_data.fetchers import BGEOMETRICS_SERIES, fetch_bgeometrics_series


def fetch(spec, *, refresh: bool = False) -> dict:
    key = spec.id if spec.id in BGEOMETRICS_SERIES else spec.source_key
    if key not in BGEOMETRICS_SERIES:
        key = spec.id
    return fetch_bgeometrics_series(key, refresh=refresh)