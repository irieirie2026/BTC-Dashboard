"""Blockchain.info charts adapter."""

from __future__ import annotations

from btc_data.fetchers import fetch_blockchain_chart


def fetch(spec, *, refresh: bool = False, timespan: str = "all") -> dict[str, Any]:
    return fetch_blockchain_chart(spec.source_key, timespan, refresh=refresh)