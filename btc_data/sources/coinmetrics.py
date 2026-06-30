"""Coin Metrics Community adapter."""

from __future__ import annotations

from typing import Any

from btc_data.coinmetrics import fetch_coinmetrics_series, fetch_exchange_netflow_series


def fetch(spec, *, refresh: bool = False) -> dict[str, Any]:
    if spec.source_key == "exchange_netflow":
        return fetch_exchange_netflow_series(refresh=refresh)
    return fetch_coinmetrics_series(spec.source_key, refresh=refresh)