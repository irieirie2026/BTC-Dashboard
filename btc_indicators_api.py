"""Chunked API for Misc → Bitcoin indicators."""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

from btc_data.config import INDICATORS, METHODOLOGY, TABS
from btc_data.fetchers import (
    BGEOMETRICS_SERIES,
    bgeometrics_status,
    compute_puell_multiple,
    fetch_bgeometrics_last,
    fetch_bgeometrics_series,
    fetch_binance_open_interest,
    fetch_bitinfo_snapshot,
    fetch_bitinfo_wallet_cohorts,
    fetch_blockchain_chart,
    fetch_coingecko_dominance,
    blockchain_hashrate_to_ehs,
    hash_rate_to_ehs,
)
from macro_data.cache import clear_cache as clear_disk_cache


def clear_all_caches() -> None:
    clear_disk_cache()


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _indicator_list() -> list[dict]:
    return [
        {
            "key": k,
            "label": v["label"],
            "unit": v["unit"],
            "tab": v["tab"],
            "format": v["format"],
            "source": v["source"],
            "update": v["update"],
            "help": v.get("help"),
            "mayProxy": v.get("mayProxy", False),
            "isEstimate": v.get("isEstimate", False),
        }
        for k, v in INDICATORS.items()
    ]


def get_meta_payload(*, refresh: bool = False) -> dict[str, Any]:
    if refresh:
        clear_all_caches()
    return {
        "tabs": TABS,
        "indicators": _indicator_list(),
        "methodology": METHODOLOGY,
        "fetchedAt": _now_iso(),
        "sources": [
            "BitInfoCharts",
            "Blockchain.info",
            "BGeometrics",
            "Alternative.me",
            "CoinGecko",
            "Binance Futures",
            "Exchange APIs",
        ],
        "bgeometrics": bgeometrics_status(),
    }


def _cell(value: Any, source: str, extra: dict | None = None) -> dict:
    cell = {"value": value, "source": source}
    if extra:
        cell.update(extra)
    return cell


def _safe_fetch(label: str, fn: Callable, *args, **kwargs) -> dict[str, Any]:
    try:
        result = fn(*args, **kwargs)
        if isinstance(result, dict):
            return result
        return {"value": result, "fetchedAt": _now_iso(), "source": label}
    except Exception as exc:
        return {"error": str(exc), "fetchedAt": _now_iso(), "source": label}


def _collect_errors(*payloads: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for payload in payloads:
        if not payload:
            continue
        if payload.get("error"):
            src = payload.get("source") or "source"
            errors.append(f"{src}: {payload['error']}")
    return errors


def _median_funding(perp_table: list[dict]) -> float | None:
    rates = []
    for row in perp_table:
        pct = row.get("fundingPct")
        if pct is not None:
            rates.append(float(pct))
    if not rates:
        return None
    rates.sort()
    mid = len(rates) // 2
    if len(rates) % 2:
        return rates[mid]
    return (rates[mid - 1] + rates[mid]) / 2


def get_snapshot_payload(*, refresh: bool = False) -> dict[str, Any]:
    from server import get_exchanges_payload, get_fear_greed_payload

    if refresh:
        clear_all_caches()

    jobs: dict[str, tuple[Callable, tuple, dict]] = {
        "bitinfo": (fetch_bitinfo_snapshot, (), {"refresh": refresh}),
        "dominance": (fetch_coingecko_dominance, (), {"refresh": refresh}),
        "oi": (fetch_binance_open_interest, (), {"refresh": refresh}),
        "fng": (get_fear_greed_payload, (), {"refresh": refresh}),
        "perp": (get_exchanges_payload, ("perp",), {}),
        "mvrv": (fetch_bgeometrics_last, ("mvrv",), {"refresh": refresh}),
        "mvrv_z": (fetch_bgeometrics_last, ("mvrv_z_score",), {"refresh": refresh}),
        "realized": (fetch_bgeometrics_last, ("realized_price",), {"refresh": refresh}),
        "netflow": (fetch_bgeometrics_last, ("exchange_netflow",), {"refresh": refresh}),
        "hodl": (fetch_bgeometrics_last, ("hodl_waves",), {"refresh": refresh}),
        "puell": (fetch_bgeometrics_last, ("puell_multiple",), {"refresh": refresh}),
        "puell_fallback": (compute_puell_multiple, (), {"refresh": refresh}),
        "active_chart": (fetch_blockchain_chart, ("n-unique-addresses", "30days"), {"refresh": refresh}),
        "hash_chart": (fetch_blockchain_chart, ("hash-rate", "30days"), {"refresh": refresh}),
    }

    data: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {
            key: pool.submit(_safe_fetch, key, fn, *args, **kwargs)
            for key, (fn, args, kwargs) in jobs.items()
        }
        for key, fut in futures.items():
            data[key] = fut.result()

    bitinfo = data["bitinfo"]
    dominance = data["dominance"]
    oi = data["oi"]
    fng = data["fng"]
    perp = data["perp"]
    mvrv = data["mvrv"]
    mvrv_z = data["mvrv_z"]
    realized = data["realized"]
    netflow = data["netflow"]
    hodl = data["hodl"]
    puell = data["puell"]
    puell_fb = data.get("puell_fallback") or {}
    if (puell.get("latest") or {}).get("value") is None and (puell_fb.get("latest") or {}).get("value") is not None:
        puell = puell_fb
    active_chart = data["active_chart"]
    hash_chart = data["hash_chart"]

    hodl_1y = _hodl_waves_1y_plus(hodl)
    bitinfo_extra = {"fetchedAt": bitinfo.get("fetchedAt")}
    if bitinfo.get("error"):
        bitinfo_extra["error"] = bitinfo.get("error")
    if bitinfo.get("stale"):
        bitinfo_extra["stale"] = True

    cells: dict[str, dict] = {
        "rich_top100_pct": _cell(bitinfo.get("rich_top100_pct"), "BitInfoCharts", bitinfo_extra),
        "rich_top1000_pct": _cell(bitinfo.get("rich_top1000_pct"), "BitInfoCharts", bitinfo_extra),
        "wealth_top10_pct": _cell(bitinfo.get("wealth_top10_pct"), "BitInfoCharts", bitinfo_extra),
        "active_addresses": _cell(
            bitinfo.get("active_addresses_24h") or (active_chart.get("latest") or {}).get("value"),
            "BitInfoCharts" if bitinfo.get("active_addresses_24h") else "Blockchain.info",
            {"fetchedAt": bitinfo.get("fetchedAt") or active_chart.get("fetchedAt")},
        ),
        "exchange_netflow": _cell(
            (netflow.get("latest") or {}).get("value"),
            "BGeometrics",
            {
                "fetchedAt": netflow.get("fetchedAt"),
                "error": netflow.get("error"),
                "stale": netflow.get("stale"),
                "mayProxy": True,
            },
        ),
        "hash_rate": _cell(
            hash_rate_to_ehs(bitinfo.get("hash_rate_zhs"))
            or blockchain_hashrate_to_ehs((hash_chart.get("latest") or {}).get("value")),
            "BitInfoCharts" if bitinfo.get("hash_rate_zhs") else "Blockchain.info",
            {"fetchedAt": bitinfo.get("fetchedAt") or hash_chart.get("fetchedAt")},
        ),
        "puell_multiple": _cell(
            (puell.get("latest") or {}).get("value"),
            puell.get("source") or "BGeometrics",
            {
                "fetchedAt": puell.get("fetchedAt"),
                "isEstimate": puell.get("source", "").startswith("Computed"),
                "error": puell.get("error"),
            },
        ),
        "mvrv": _cell(
            (mvrv.get("latest") or {}).get("value"),
            "BGeometrics",
            {"fetchedAt": mvrv.get("fetchedAt"), "error": mvrv.get("error"), "stale": mvrv.get("stale")},
        ),
        "mvrv_z_score": _cell(
            (mvrv_z.get("latest") or {}).get("value"),
            "BGeometrics",
            {"fetchedAt": mvrv_z.get("fetchedAt"), "error": mvrv_z.get("error"), "stale": mvrv_z.get("stale")},
        ),
        "realized_price": _cell(
            (realized.get("latest") or {}).get("value"),
            "BGeometrics",
            {"fetchedAt": realized.get("fetchedAt"), "error": realized.get("error"), "stale": realized.get("stale")},
        ),
        "hodl_waves_1y_plus": _cell(
            hodl_1y,
            "BGeometrics",
            {"fetchedAt": hodl.get("fetchedAt"), "error": hodl.get("error"), "mayProxy": True},
        ),
        "fear_greed": _cell(
            (fng.get("latest") or {}).get("value"),
            "Alternative.me",
            {
                "fetchedAt": fng.get("fetchedAt"),
                "classification": (fng.get("latest") or {}).get("classification"),
            },
        ),
        "funding_rate": _cell(
            _median_funding(perp.get("table") or []),
            "Exchange APIs",
            {"fetchedAt": perp.get("fetchedAt"), "venueCount": len(perp.get("table") or [])},
        ),
        "open_interest": _cell(
            oi.get("value"),
            "Binance Futures",
            {"fetchedAt": oi.get("fetchedAt"), "error": oi.get("error")},
        ),
        "btc_dominance": _cell(
            dominance.get("value"),
            "CoinGecko",
            {"fetchedAt": dominance.get("fetchedAt"), "error": dominance.get("error")},
        ),
    }

    errors = _collect_errors(
        bitinfo,
        dominance,
        oi,
        mvrv,
        mvrv_z,
        realized,
        netflow,
        hodl,
        puell,
        active_chart,
        hash_chart,
    )
    for key, cell in cells.items():
        if cell.get("error"):
            errors.append(f"{key}: {cell['error']}")

    return {
        "cells": cells,
        "indicators": _indicator_list(),
        "fetchedAt": _now_iso(),
        "errors": sorted(set(errors)),
        "partial": bool(errors),
        "sourceChain": "BitInfoCharts → Blockchain.info → BGeometrics → Alternative.me → CoinGecko → Exchanges",
    }


def _hodl_waves_1y_plus(hodl_payload: dict) -> float | None:
    series = hodl_payload.get("series") or []
    if not series:
        return None
    latest = series[-1]
    val = latest.get("value")
    if val is not None and val > 0:
        return float(val)
    return None


def get_distribution_payload(*, refresh: bool = False) -> dict[str, Any]:
    with ThreadPoolExecutor(max_workers=2) as pool:
        bitinfo_f = pool.submit(_safe_fetch, "bitinfo", fetch_bitinfo_snapshot, refresh=refresh)
        cohorts_f = pool.submit(_safe_fetch, "cohorts", fetch_bitinfo_wallet_cohorts, refresh=refresh)
        bitinfo = bitinfo_f.result()
        cohorts = cohorts_f.result()

    errors = _collect_errors(bitinfo, cohorts)
    return {
        "wealth": {
            "top10_pct": bitinfo.get("wealth_top10_pct"),
            "top100_pct": bitinfo.get("rich_top100_pct"),
            "top1000_pct": bitinfo.get("rich_top1000_pct"),
            "top10000_pct": bitinfo.get("wealth_top10000_pct"),
            "top100_btc": bitinfo.get("top100_btc"),
        },
        "cohorts": cohorts.get("cohorts") or [],
        "source": "BitInfoCharts",
        "fetchedAt": bitinfo.get("fetchedAt") or cohorts.get("fetchedAt"),
        "note": "Address-level distribution; not entity-adjusted. Exchange cold wallets may inflate whale counts.",
        "errors": errors,
        "partial": bool(errors),
    }


def get_series_payload(
    indicator: str,
    *,
    timespan: str = "1year",
    refresh: bool = False,
) -> dict[str, Any]:
    try:
        if indicator == "puell_multiple":
            data = _safe_fetch("puell", compute_puell_multiple, refresh=refresh)
            return {"indicator": indicator, **data}

        if indicator == "hodl_waves_1y_plus":
            indicator = "hodl_waves"

        if indicator in BGEOMETRICS_SERIES:
            data = _safe_fetch("bgeometrics", fetch_bgeometrics_series, indicator, refresh=refresh)
            return {"indicator": indicator, **data}

        bc_map = {
            "active_addresses": "n-unique-addresses",
            "hash_rate": "hash-rate",
            "market_price": "market-price",
        }
        if indicator in bc_map:
            data = _safe_fetch(
                "blockchain",
                fetch_blockchain_chart,
                bc_map[indicator],
                timespan,
                refresh=refresh,
            )
            return {"indicator": indicator, **data}

        if indicator == "fear_greed":
            from server import get_fear_greed_payload

            fng = _safe_fetch("fear_greed", get_fear_greed_payload, refresh=refresh)
            series = [
                {"timestamp": p["timestamp"], "date": p["date"], "value": float(p["value"])}
                for p in (fng.get("series") or [])
            ]
            return {
                "indicator": indicator,
                "series": series,
                "latest": series[-1] if series else None,
                "source": "Alternative.me",
                "fetchedAt": fng.get("fetchedAt"),
                "error": fng.get("error"),
            }

        if indicator == "btc_dominance":
            dom = _safe_fetch("coingecko", fetch_coingecko_dominance, refresh=refresh)
            return {
                "indicator": indicator,
                "series": [{"timestamp": None, "date": "", "value": dom.get("value")}],
                "latest": {"value": dom.get("value")},
                "source": "CoinGecko",
                "fetchedAt": dom.get("fetchedAt"),
                "error": dom.get("error"),
                "note": "Snapshot only — historical dominance requires premium feed",
            }

        if indicator == "open_interest":
            oi = _safe_fetch("binance", fetch_binance_open_interest, refresh=refresh)
            return {
                "indicator": indicator,
                "series": [{"timestamp": None, "date": "", "value": oi.get("value")}],
                "latest": {"value": oi.get("value")},
                "source": "Binance Futures",
                "fetchedAt": oi.get("fetchedAt"),
                "error": oi.get("error"),
                "note": "Snapshot only — use Derivatives tab for venue breakdown",
            }

        if indicator == "funding_rate":
            from server import get_exchanges_payload

            perp = _safe_fetch("exchanges", get_exchanges_payload, "perp")
            med = _median_funding(perp.get("table") or [])
            return {
                "indicator": indicator,
                "series": [{"timestamp": None, "date": "", "value": med}],
                "latest": {"value": med},
                "source": "Exchange APIs",
                "fetchedAt": perp.get("fetchedAt"),
                "error": perp.get("error"),
                "note": "Cross-venue median snapshot — see Derivatives for history",
            }

        raise ValueError(f"Unknown indicator: {indicator}")
    except ValueError:
        raise
    except Exception as exc:
        return {
            "indicator": indicator,
            "series": [],
            "latest": None,
            "error": str(exc),
            "fetchedAt": _now_iso(),
        }