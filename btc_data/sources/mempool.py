"""Mempool.space adapter."""

from __future__ import annotations

from btc_data.fetchers import fetch_mempool_fees


def fetch(spec, *, refresh: bool = False) -> dict[str, Any]:
    data = fetch_mempool_fees(refresh=refresh)
    val = data.get("fast_fee") or data.get("value")
    series = []
    if val is not None:
        import time

        ts = int(time.time())
        series = [{
            "timestamp": ts,
            "date": time.strftime("%Y-%m-%d", time.gmtime(ts)),
            "value": float(val),
        }]
    return {
        "series": series,
        "latest": series[-1] if series else None,
        "source": "Mempool.space",
        "fetchedAt": data.get("fetchedAt"),
        "error": data.get("error"),
        **{k: data[k] for k in ("fast_fee", "hour_fee", "economy_fee", "mempool_count") if k in data},
    }