"""Source adapters — route registry metrics to provider fetchers."""

from __future__ import annotations

from typing import Any

from btc_data.registry import MetricSpec
from btc_data.sources import (
    blockchair,
    blockchain,
    bgeometrics,
    coinmetrics,
    dune,
    mempool,
    santiment,
)


def fetch_metric(spec: MetricSpec, *, refresh: bool = False, timespan: str = "2years") -> dict[str, Any]:
    source = spec.source
    if source == "bgeometrics":
        return bgeometrics.fetch(spec, refresh=refresh)
    if source == "coinmetrics":
        return coinmetrics.fetch(spec, refresh=refresh)
    if source == "blockchain":
        return blockchain.fetch(spec, refresh=refresh, timespan=timespan)
    if source == "blockchair":
        return blockchair.fetch(spec, refresh=refresh)
    if source == "mempool":
        return mempool.fetch(spec, refresh=refresh)
    if source == "santiment":
        return santiment.fetch(spec, refresh=refresh)
    if source == "dune":
        return dune.fetch(spec, refresh=refresh)
    return {
        "series": [],
        "latest": None,
        "source": spec.source,
        "error": f"Unknown source: {spec.source}",
    }