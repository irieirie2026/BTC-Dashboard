"""Chunked API for Misc → Bitcoin indicators."""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

from btc_data.coinmetrics import (
    COINMETRICS_METRICS,
    fetch_coinmetrics_series,
    fetch_exchange_netflow_series,
)
from btc_data.config import (
    BGEOMETRICS_TTL,
    BITINFO_TTL,
    CHART_INFO,
    INDICATORS,
    INTELLIGENCE_SERIES_KEYS,
    METHODOLOGY,
    MINER_SERIES_KEYS,
    NETWORK_SERIES_KEYS,
    TABS,
    VALUATION_SERIES_KEYS,
)
from btc_data.series_resolver import get_metric_data
from btc_data.registry import REGISTRY, registry_payload, refresh_registry
from btc_data.store import read_series_cached
from btc_data.scheduler import get_stored_metric, run_batch, status_payload
from btc_data.valuation_models import get_models_meta, get_tab_bundle
from macro_data.cache import cache_get, cache_set
from btc_data.fetchers import (
    BGEOMETRICS_SERIES,
    SNAPSHOT_KPI_METRICS,
    bgeometrics_status,
    compute_puell_multiple,
    fetch_bgeometrics_kpi_bundle,
    fetch_bgeometrics_series,
    fetch_binance_open_interest,
    fetch_bitinfo_snapshot,
    fetch_bitinfo_wallet_cohorts,
    fetch_blockchain_chart,
    fetch_coingecko_dominance,
    fetch_mempool_fees,
    hash_rate_to_ehs,
    normalize_hash_rate_ehs,
)
from cache.service import get_cache_service
from macro_data.cache import clear_cache as clear_disk_cache


def clear_all_caches() -> None:
    get_cache_service().invalidate_prefix("btc:bundle:")
    get_cache_service().invalidate_prefix("btc:series:")
    get_cache_service().invalidate_prefix("btc:fetch:")
    clear_disk_cache()


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# Live snapshots / broken free-tier paths — keep in catalog but hide from Overview chart picker.
OVERVIEW_SNAPSHOT_ONLY = frozenset({
    "mempool_fees",
    "open_interest",
    "funding_rate",
})
FRAMEWORK_MODEL_IDS = frozenset({
    "stock_to_flow",
    "stock_to_flow_cross",
    "power_law",
    "delta_balanced_price",
    "pi_cycle_top",
    "rainbow_chart",
    "nvt_ratio",
    "metcalfe",
    "coin_days_destroyed",
    "difficulty_ribbon",
})

OVERVIEW_UNSUPPORTED = frozenset({
    "hashribbons",  # BGeometrics free path returns 404
    *FRAMEWORK_MODEL_IDS,
})


def _normalize_series_points(series: list[dict]) -> list[dict]:
    out: list[dict] = []
    for point in series:
        if not isinstance(point, dict):
            continue
        ts = point.get("timestamp")
        date = str(point.get("date") or "")[:10]
        if ts is not None:
            try:
                ts = int(ts)
                if ts > 10_000_000_000:
                    ts //= 1000
            except (TypeError, ValueError):
                ts = None
        if ts is None and date:
            try:
                ts = int(time.mktime(time.strptime(date, "%Y-%m-%d")))
            except (ValueError, OverflowError):
                ts = None
        out.append({**point, "timestamp": ts, "date": date or point.get("date", "")})
    out.sort(key=lambda p: p.get("timestamp") or 0)
    return out


def _series_supported(indicator: str) -> bool:
    """Whether ``get_series_payload`` can serve this indicator (no network I/O)."""
    from btc_data.registry import REGISTRY, refresh_registry

    refresh_registry()
    registry_key = "hodl_waves" if indicator == "hodl_waves_1y_plus" else indicator
    if registry_key in REGISTRY and REGISTRY[registry_key].enabled:
        return True
    if indicator in (
        "puell_multiple",
        "exchange_netflow",
        "active_addresses",
        "hash_rate",
        "market_price",
        "fear_greed",
        "btc_dominance",
        "open_interest",
        "funding_rate",
    ):
        return True
    if indicator in COINMETRICS_METRICS:
        return True
    if indicator in BGEOMETRICS_SERIES:
        return True
    return False


def _overview_chartable(indicator: str) -> bool:
    if indicator in OVERVIEW_SNAPSHOT_ONLY or indicator in OVERVIEW_UNSUPPORTED:
        return False
    return _series_supported(indicator)


def _finalize_series_payload(indicator: str, data: dict[str, Any]) -> dict[str, Any]:
    out = _strip_error_if_series({**data, "indicator": indicator})
    series = out.get("series")
    if isinstance(series, list) and series:
        out["series"] = _normalize_series_points(series)
        if out.get("latest") is None:
            out["latest"] = out["series"][-1]
    return out


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
            "chartable": _overview_chartable(k),
        }
        for k, v in INDICATORS.items()
    ]


def get_meta_payload(*, refresh: bool = False) -> dict[str, Any]:
    from btc_data.chart_education import build_chart_education

    if refresh:
        clear_all_caches()
    return {
        "tabs": TABS,
        "indicators": _indicator_list(),
        "chartEducation": build_chart_education(),
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
        "chartInfo": CHART_INFO,
        "prefetch": {
            "statusUrl": "/api/misc/btc/prefetch/status",
            "storedUrl": "/api/misc/btc/stored?metric=",
            "cli": "python3 scripts/btc_prefetch.py --once",
        },
    }


def _cell(value: Any, source: str, extra: dict | None = None) -> dict:
    cell = {"value": value, "source": source}
    if extra:
        cell.update(extra)
    return cell


_REGISTRY_SNAPSHOT_ALIASES = {
    "hodl_waves_1y_plus": "hodl_waves",
}


def _latest_from_series_data(data: dict[str, Any]) -> Any:
    latest = data.get("latest")
    if isinstance(latest, dict) and latest.get("value") is not None:
        return latest.get("value")
    series = data.get("series") or []
    if series:
        val = series[-1].get("value")
        if val is not None:
            return val
    return data.get("value")


def _data_as_of_from_series_data(data: dict[str, Any]) -> str | None:
    """Calendar date of the latest observation (not fetch wall-clock)."""
    latest = data.get("latest")
    if isinstance(latest, dict):
        if latest.get("date"):
            return str(latest["date"])[:10]
        ts = latest.get("timestamp")
        if ts is not None:
            try:
                t = float(ts)
                if t > 1e12:
                    t /= 1000.0
                return time.strftime("%Y-%m-%d", time.gmtime(t))
            except (TypeError, ValueError, OSError):
                pass
    series = data.get("series") or []
    if series:
        last = series[-1] or {}
        if last.get("date"):
            return str(last["date"])[:10]
        ts = last.get("timestamp")
        if ts is not None:
            try:
                t = float(ts)
                if t > 1e12:
                    t /= 1000.0
                return time.strftime("%Y-%m-%d", time.gmtime(t))
            except (TypeError, ValueError, OSError):
                pass
    return None


def _parse_iso_ts(iso: str | None) -> float | None:
    if not iso or not isinstance(iso, str):
        return None
    try:
        s = iso.strip().replace("Z", "+00:00")
        from datetime import datetime

        return datetime.fromisoformat(s).timestamp()
    except (TypeError, ValueError):
        return None


def _apply_cell_freshness(cell: dict[str, Any], *, ttl: int = 86_400) -> dict[str, Any]:
    """Mark cell stale when fetch is older than 1.5× TTL (or source already flagged)."""
    if not cell:
        return cell
    if cell.get("stale"):
        return cell
    fetched = _parse_iso_ts(cell.get("fetchedAt"))
    if fetched is None:
        return cell
    age = time.time() - fetched
    if age > max(ttl * 1.5, 36 * 3600):
        cell["stale"] = True
        cell["staleReason"] = "fetch_age"
    return cell


def _snapshot_value_usable(key: str, val: Any) -> bool:
    """True when a snapshot cell value should count as present (not a placeholder)."""
    if val is None:
        return False
    try:
        fval = float(val)
    except (TypeError, ValueError):
        return False
    if key == "hashprice":
        return fval > 0.0001
    if key in ("difficulty", "difficulty_ribbon"):
        return fval > 1.0
    if key.endswith("_pct"):
        return fval > 0
    return True


def _cell_value_missing(key: str, cell: dict | None) -> bool:
    if not cell:
        return True
    return not _snapshot_value_usable(key, cell.get("value"))


def _cell_from_series_data(data: dict[str, Any], default_source: str) -> dict:
    val = _latest_from_series_data(data)
    extra: dict[str, Any] = {}
    for field in (
        "fetchedAt",
        "error",
        "stale",
        "fromStore",
        "fromCache",
        "note",
        "mayProxy",
        "isEstimate",
    ):
        if data.get(field) is not None:
            extra[field] = data[field]
    as_of = _data_as_of_from_series_data(data)
    if as_of:
        extra["dataAsOf"] = as_of
    return _apply_cell_freshness(
        _cell(val, data.get("source") or default_source, extra or None)
    )


def _store_series_body(metric_id: str, *, ttl: int) -> dict[str, Any] | None:
    body = read_series_cached(metric_id, ttl=max(ttl * 7, ttl))
    if body and body.get("series"):
        return body
    return None


def _cached_series_body(cache_key: str, *, ttl: int) -> dict[str, Any] | None:
    cached = cache_get(cache_key, ttl=ttl)
    if cached and cached.get("series"):
        return cached
    return None


def _enrich_framework_snapshot_cells(cells: dict[str, dict], *, refresh: bool = False) -> None:
    """Fill snapshot cells for embedded valuation framework models."""
    from btc_data.valuation_models import TAB_MODELS, _fetch_model_series, get_tab_bundle

    for tab, model_ids in TAB_MODELS.items():
        bundle = get_tab_bundle(tab, refresh=refresh) if refresh else None
        for model_id in model_ids:
            if not _cell_value_missing(model_id, cells.get(model_id)):
                continue
            meta = INDICATORS.get(model_id, {})
            data: dict[str, Any] = {}
            if refresh:
                data = _fetch_model_series(model_id, refresh=True)
            elif bundle:
                data = (bundle.get("charts") or {}).get(model_id) or {}
            if not data.get("series") and not refresh:
                cached_bundle = get_tab_bundle(tab, refresh=False)
                data = (cached_bundle.get("charts") or {}).get(model_id) or {}
            if not data.get("series") and refresh:
                continue
            if not data.get("series") and not refresh:
                data = _fetch_model_series(model_id, refresh=False)
            if _latest_from_series_data(data) is None:
                continue
            cells[model_id] = _cell_from_series_data(data, meta.get("source", "Framework"))


def _enrich_snapshot_cells(cells: dict[str, dict], *, refresh: bool = False) -> None:
    """Fill snapshot table cells for catalog metrics missing from the fast KPI fetch."""
    refresh_registry()
    _enrich_framework_snapshot_cells(cells, refresh=refresh)

    for key, meta in INDICATORS.items():
        if not _cell_value_missing(key, cells.get(key)):
            continue

        source = meta["source"]
        registry_key = _REGISTRY_SNAPSHOT_ALIASES.get(key, key)
        spec = REGISTRY.get(registry_key)

        if spec and spec.enabled:
            data = (
                get_metric_data(registry_key, refresh=True)
                if refresh
                else _store_series_body(registry_key, ttl=spec.ttl)
            )
            if data and _latest_from_series_data(data) is not None:
                cells[key] = _cell_from_series_data(data, source)
                continue

        if key == "exchange_netflow":
            if refresh:
                data = _safe_fetch(
                    "exchange_netflow",
                    fetch_exchange_netflow_series,
                    days_back=30,
                    refresh=True,
                )
            else:
                data = _cached_series_body("btc:cm:v1:exchange_netflow:30", ttl=43200 * 7)
            if data and _latest_from_series_data(data) is not None:
                cells[key] = _cell_from_series_data(data, source)
            continue

        if key in COINMETRICS_METRICS:
            cache_key = f"btc:cm:v2:{key}:30"
            if refresh:
                data = _safe_fetch(
                    key,
                    fetch_coinmetrics_series,
                    key,
                    days_back=30,
                    refresh=True,
                )
            else:
                data = _cached_series_body(cache_key, ttl=43200 * 7)
            if data and _latest_from_series_data(data) is not None:
                cells[key] = _cell_from_series_data(data, source)
            continue

        if refresh and _series_supported(key):
            try:
                data = get_series_payload(key, timespan="1year", refresh=True)
            except ValueError:
                continue
            if _latest_from_series_data(data) is not None:
                cells[key] = _cell_from_series_data(data, source)


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


_SNAPSHOT_JOB_TIMEOUTS: dict[str, int] = {
    "perp": 18,
    "bitinfo": 35,
    "dominance": 20,
    "oi": 20,
    "fng": 25,
    "puell": 35,
    "active_chart": 35,
    "hash_chart": 35,
    "netflow": 40,
    "mempool": 20,
}


def _fetch_netflow_snapshot(*, refresh: bool = False) -> dict[str, Any]:
    for days in (90, 30, 7):
        cached = _cached_series_body(f"btc:cm:v1:exchange_netflow:{days}", ttl=43200 * 7)
        if cached:
            return cached
    if not refresh:
        return {
            "series": [],
            "latest": None,
            "source": "Coin Metrics Community",
            "error": "netflow cache miss",
            "fetchedAt": _now_iso(),
        }
    return fetch_exchange_netflow_series(days_back=90, refresh=True)


def _fetch_bg_kpi_snapshot(*, refresh: bool = False) -> dict[str, dict[str, Any]]:
    if refresh:
        return fetch_bgeometrics_kpi_bundle(refresh=True)
    out: dict[str, dict[str, Any]] = {}
    for metric in SNAPSHOT_KPI_METRICS:
        body = _store_series_body(metric, ttl=86400)
        if not body:
            continue
        out[metric] = {
            "latest": body.get("latest") or ((body.get("series") or [None])[-1]),
            "source": body.get("source") or "BGeometrics",
            "fetchedAt": body.get("fetchedAt"),
            "stale": body.get("stale"),
            "fromStore": True,
        }
    if out:
        return out
    if refresh:
        return fetch_bgeometrics_kpi_bundle(refresh=True)
    return {}


def _fetch_perp_snapshot(*, refresh: bool = False) -> dict[str, Any]:
    from server import get_exchanges_payload

    with ThreadPoolExecutor(max_workers=1) as pool:
        fut = pool.submit(get_exchanges_payload, "perp", refresh=refresh)
        try:
            result = fut.result(timeout=18 if not refresh else 45)
        except Exception as exc:
            return {
                "table": [],
                "error": f"Exchanges snapshot timeout — {exc}",
                "fetchedAt": _now_iso(),
                "source": "Exchange APIs",
            }
    if isinstance(result, dict):
        return result
    return {"value": result, "fetchedAt": _now_iso(), "source": "Exchange APIs"}


def _hash_rate_snapshot_ehs(
    bitinfo: dict[str, Any],
    hash_chart: dict[str, Any],
    *,
    from_store: bool = False,
) -> float | None:
    zhs = bitinfo.get("hash_rate_zhs")
    if zhs is not None:
        return hash_rate_to_ehs(zhs)
    latest = (hash_chart.get("latest") or {}).get("value")
    return normalize_hash_rate_ehs(
        latest,
        unit=hash_chart.get("unit"),
        from_store=from_store,
    )


def _blockchair_difficulty_from_store() -> float | None:
    body = _store_series_body("blockchair_stats", ttl=86400)
    if not body:
        return None
    latest = body.get("latest") or {}
    snap = latest.get("snapshot") if isinstance(latest, dict) else None
    if isinstance(snap, dict) and snap.get("difficulty") is not None:
        return float(snap["difficulty"])
    for pt in reversed(body.get("series") or []):
        snap = pt.get("snapshot") if isinstance(pt, dict) else None
        if isinstance(snap, dict) and snap.get("difficulty") is not None:
            return float(snap["difficulty"])
    return None


def _repair_snapshot_cells(cells: dict[str, dict]) -> None:
    """Fix known bad cached snapshot values using disk store."""
    hr = cells.get("hash_rate") or {}
    val = hr.get("value")
    if val is not None:
        try:
            fval = float(val)
        except (TypeError, ValueError):
            fval = None
        if fval is not None and fval < 50:
            body = _store_series_body("hash_rate", ttl=86400)
            if body:
                fixed = normalize_hash_rate_ehs(
                    _latest_from_series_data(body),
                    unit=body.get("unit"),
                    from_store=True,
                )
                if fixed is not None and fixed >= 50:
                    cells["hash_rate"] = _cell(
                        fixed,
                        body.get("source") or hr.get("source") or "Blockchain.info",
                        {
                            "fetchedAt": body.get("fetchedAt") or hr.get("fetchedAt"),
                            "fromStore": True,
                            "stale": body.get("stale"),
                        },
                    )

    if _cell_value_missing("hashprice", cells.get("hashprice")):
        body = _store_series_body("hashprice", ttl=86400)
        if body:
            fixed = _latest_from_series_data(body)
            if _snapshot_value_usable("hashprice", fixed):
                cells["hashprice"] = _cell_from_series_data(body, body.get("source") or "BGeometrics")

    for diff_key in ("difficulty", "difficulty_ribbon"):
        if not _cell_value_missing(diff_key, cells.get(diff_key)):
            continue
        body = _store_series_body("difficulty", ttl=86400)
        if body and _latest_from_series_data(body) is not None:
            cells[diff_key] = _cell_from_series_data(
                body,
                cells.get(diff_key, {}).get("source") or body.get("source") or "BGeometrics",
            )
            continue
        fixed = _blockchair_difficulty_from_store()
        if _snapshot_value_usable("difficulty", fixed):
            cells["difficulty"] = _cell(
                fixed,
                "Blockchair",
                {"fromStore": True, "fetchedAt": _now_iso()},
            )

    if _cell_value_missing("funding_rate", cells.get("funding_rate")):
        try:
            from server import get_exchanges_payload

            perp = get_exchanges_payload("perp", refresh=False)
            med = _median_funding(perp.get("table") or [])
            if med is not None:
                cells["funding_rate"] = _cell(
                    med,
                    "Exchange APIs",
                    {
                        "fetchedAt": perp.get("fetchedAt"),
                        "venueCount": len(perp.get("table") or []),
                        "fromCache": True,
                    },
                )
        except Exception:
            pass

    for wealth_key, bitinfo_key in (
        ("wealth_top10_pct", "wealth_top10_pct"),
        ("rich_top100_pct", "rich_top100_pct"),
        ("rich_top1000_pct", "rich_top1000_pct"),
    ):
        if not _cell_value_missing(wealth_key, cells.get(wealth_key)):
            continue
        bitinfo = cache_get("btc:bitinfo:snapshot:v1", ttl=BITINFO_TTL) or {}
        fixed = bitinfo.get(bitinfo_key)
        if _snapshot_value_usable(wealth_key, fixed):
            cells[wealth_key] = _cell(
                fixed,
                "BitInfoCharts",
                {
                    "fetchedAt": bitinfo.get("fetchedAt"),
                    "stale": bitinfo.get("stale"),
                    "fromCache": True,
                },
            )

    for model_id in ("delta_balanced_price", "difficulty_ribbon"):
        if not _cell_value_missing(model_id, cells.get(model_id)):
            continue
        try:
            from btc_data.valuation_models import _fetch_model_series

            data = _fetch_model_series(model_id, refresh=False)
            if _latest_from_series_data(data) is not None:
                meta = INDICATORS.get(model_id, {})
                cells[model_id] = _cell_from_series_data(
                    data,
                    meta.get("source", "Framework"),
                )
        except Exception:
            continue

    if _cell_value_missing("difficulty_ribbon", cells.get("difficulty_ribbon")):
        diff_cell = cells.get("difficulty") or {}
        if _snapshot_value_usable("difficulty", diff_cell.get("value")):
            cells["difficulty_ribbon"] = {
                **diff_cell,
                "source": diff_cell.get("source") or "Blockchair",
                "note": "Latest difficulty (ribbon uses same base series when model cache is empty)",
            }


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


def _assemble_snapshot_cells(
    *,
    bitinfo: dict[str, Any],
    dominance: dict[str, Any],
    oi: dict[str, Any],
    fng: dict[str, Any],
    perp: dict[str, Any],
    mvrv: dict[str, Any],
    mvrv_z: dict[str, Any],
    realized: dict[str, Any],
    hodl: dict[str, Any],
    puell: dict[str, Any],
    active_chart: dict[str, Any],
    hash_chart: dict[str, Any],
    netflow: dict[str, Any],
    mempool: dict[str, Any],
) -> dict[str, dict]:
    hodl_1y = _hodl_waves_1y_plus(hodl)
    bitinfo_extra = {"fetchedAt": bitinfo.get("fetchedAt")}
    if bitinfo.get("error"):
        bitinfo_extra["error"] = bitinfo.get("error")
    if bitinfo.get("stale"):
        bitinfo_extra["stale"] = True

    return {
        "rich_top100_pct": _cell(bitinfo.get("rich_top100_pct"), "BitInfoCharts", bitinfo_extra),
        "rich_top1000_pct": _cell(bitinfo.get("rich_top1000_pct"), "BitInfoCharts", bitinfo_extra),
        "wealth_top10_pct": _cell(bitinfo.get("wealth_top10_pct"), "BitInfoCharts", bitinfo_extra),
        "active_addresses": _cell(
            bitinfo.get("active_addresses_24h") or (active_chart.get("latest") or {}).get("value"),
            "BitInfoCharts" if bitinfo.get("active_addresses_24h") else "Blockchain.info",
            {"fetchedAt": bitinfo.get("fetchedAt") or active_chart.get("fetchedAt")},
        ),
        "hash_rate": _cell(
            _hash_rate_snapshot_ehs(bitinfo, hash_chart, from_store=hash_chart.get("fromStore", False)),
            "BitInfoCharts" if bitinfo.get("hash_rate_zhs") else "Blockchain.info",
            {"fetchedAt": bitinfo.get("fetchedAt") or hash_chart.get("fetchedAt")},
        ),
        "exchange_netflow": _cell(
            (netflow.get("latest") or {}).get("value"),
            "Coin Metrics Community",
            {
                "fetchedAt": netflow.get("fetchedAt"),
                "error": netflow.get("error"),
                "stale": netflow.get("stale"),
                "note": netflow.get("note"),
            },
        ),
        "mempool_fees": _cell(
            mempool.get("value"),
            "Mempool.space",
            {
                "fetchedAt": mempool.get("fetchedAt"),
                "error": mempool.get("error"),
                "fastFee": mempool.get("fast_fee"),
                "hourFee": mempool.get("hour_fee"),
                "mempoolCount": mempool.get("mempool_count"),
            },
        ),
        "puell_multiple": _cell_from_series_data(
            {
                "latest": puell.get("latest"),
                "series": puell.get("series"),
                "fetchedAt": puell.get("fetchedAt"),
                "error": puell.get("error"),
                "isEstimate": (puell.get("source") or "").startswith("Computed"),
                "source": puell.get("source") or "Computed · Blockchain.info",
            },
            puell.get("source") or "Computed · Blockchain.info",
        ),
        "mvrv": _cell_from_series_data(
            {
                "latest": mvrv.get("latest"),
                "series": mvrv.get("series"),
                "fetchedAt": mvrv.get("fetchedAt"),
                "error": mvrv.get("error"),
                "stale": mvrv.get("stale"),
                "source": mvrv.get("source") or "BGeometrics",
            },
            "BGeometrics",
        ),
        "mvrv_z_score": _cell_from_series_data(
            {
                "latest": mvrv_z.get("latest"),
                "series": mvrv_z.get("series"),
                "fetchedAt": mvrv_z.get("fetchedAt"),
                "error": mvrv_z.get("error"),
                "stale": mvrv_z.get("stale"),
                "source": mvrv_z.get("source") or "BGeometrics",
            },
            "BGeometrics",
        ),
        "realized_price": _cell_from_series_data(
            {
                "latest": realized.get("latest"),
                "series": realized.get("series"),
                "fetchedAt": realized.get("fetchedAt"),
                "error": realized.get("error"),
                "stale": realized.get("stale"),
                "source": realized.get("source") or "BGeometrics",
            },
            "BGeometrics",
        ),
        "hodl_waves_1y_plus": _cell_from_series_data(
            {
                "latest": {"value": hodl_1y, "date": (hodl.get("latest") or {}).get("date")}
                if hodl_1y is not None
                else None,
                "series": hodl.get("series"),
                "fetchedAt": hodl.get("fetchedAt"),
                "error": hodl.get("error"),
                "mayProxy": True,
                "source": hodl.get("source") or "BGeometrics",
            },
            "BGeometrics",
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
            {
                "fetchedAt": dominance.get("fetchedAt"),
                "error": dominance.get("error"),
                "note": "Snapshot from CoinGecko; chart uses BGeometrics history",
            },
        ),
    }


def _build_fast_snapshot_cells() -> dict[str, dict]:
    from cache.legacy import legacy_cache_get

    bitinfo = cache_get("btc:bitinfo:snapshot:v1", ttl=BITINFO_TTL) or {}
    dominance = cache_get("btc:coingecko:dominance:v1", ttl=3600) or {}
    oi = cache_get("btc:binance:oi:v1", ttl=900) or {}
    mempool = cache_get("btc:mempool:fees:v1", ttl=900) or {}
    puell = cache_get("btc:puell:computed:v1", ttl=86400) or {}
    fng = legacy_cache_get("misc:fear-greed", 14400) or {}
    perp: dict[str, Any] = {"table": [], "fetchedAt": _now_iso(), "source": "Exchange APIs"}
    try:
        from server import get_exchanges_payload

        perp = get_exchanges_payload("perp", refresh=False) or perp
    except Exception:
        pass
    netflow = _fetch_netflow_snapshot(refresh=False)
    bg_kpis = _fetch_bg_kpi_snapshot(refresh=False)

    active_body = _store_series_body("active_addresses", ttl=86400) or {}
    hash_body = _store_series_body("hash_rate", ttl=86400) or {}
    active_chart = {
        "latest": active_body.get("latest") or ((active_body.get("series") or [None])[-1]),
        "fetchedAt": active_body.get("fetchedAt"),
    }
    hash_chart = {
        "latest": hash_body.get("latest") or ((hash_body.get("series") or [None])[-1]),
        "fetchedAt": hash_body.get("fetchedAt"),
        "unit": hash_body.get("unit") or ("EH/s" if hash_body else None),
        "fromStore": bool(hash_body),
    }
    if not (puell.get("latest") or puell.get("series")):
        puell_body = _store_series_body("puell_multiple", ttl=86400) or {}
        puell = {
            "latest": puell_body.get("latest"),
            "source": puell_body.get("source"),
            "fetchedAt": puell_body.get("fetchedAt"),
            "error": puell_body.get("error"),
        }

    return _assemble_snapshot_cells(
        bitinfo=bitinfo,
        dominance=dominance,
        oi=oi,
        fng=fng,
        perp=perp,
        mvrv=bg_kpis.get("mvrv") or {},
        mvrv_z=bg_kpis.get("mvrv_z_score") or {},
        realized=bg_kpis.get("realized_price") or {},
        hodl=bg_kpis.get("hodl_waves") or {},
        puell=puell,
        active_chart=active_chart,
        hash_chart=hash_chart,
        netflow=netflow,
        mempool=mempool,
    )


def _finalize_snapshot_payload(
    cells: dict[str, dict],
    *,
    source_chain: str,
    fast_path: bool = False,
    from_cache: bool = False,
    refresh: bool = False,
) -> dict[str, Any]:
    """Enrich from disk store, repair known bad values, refresh indicator catalog."""
    _enrich_snapshot_cells(cells, refresh=refresh)
    _repair_snapshot_cells(cells)
    errors: list[str] = []
    stale_count = 0
    for key, cell in cells.items():
        if not isinstance(cell, dict):
            continue
        # Prefer registry TTL when available
        registry_key = _REGISTRY_SNAPSHOT_ALIASES.get(key, key)
        spec = REGISTRY.get(registry_key)
        ttl = int(getattr(spec, "ttl", 86_400) or 86_400)
        _apply_cell_freshness(cell, ttl=ttl)
        if cell.get("stale"):
            stale_count += 1
        if cell.get("error"):
            errors.append(f"{key}: {cell['error']}")
    return {
        "cells": cells,
        "indicators": _indicator_list(),
        "fetchedAt": _now_iso(),
        "errors": sorted(set(errors)),
        "partial": bool(errors),
        "staleCount": stale_count,
        "sourceChain": source_chain,
        "fastPath": fast_path,
        "fromCache": from_cache,
    }


def get_snapshot_payload(*, refresh: bool = False) -> dict[str, Any]:
    from server import get_fear_greed_payload

    cache_key = "btc:bundle:snapshot:v8"
    fast_source = (
        "Store-first snapshot · BitInfoCharts cache → BGeometrics disk → "
        "Coin Metrics · Santiment store"
    )
    if not refresh:
        cached = cache_get(cache_key, ttl=300)
        if cached is not None:
            cells = dict(cached.get("cells") or {})
            return _finalize_snapshot_payload(
                cells,
                source_chain=cached.get("sourceChain") or fast_source,
                fast_path=cached.get("fastPath", True),
                from_cache=True,
                refresh=False,
            )
        cells = _build_fast_snapshot_cells()
        payload = _finalize_snapshot_payload(
            cells,
            source_chain=fast_source,
            fast_path=True,
            from_cache=False,
            refresh=False,
        )
        cache_set(cache_key, payload, ttl=300)
        return payload

    if refresh:
        clear_all_caches()

    jobs: dict[str, tuple[Callable, tuple, dict]] = {
        "bitinfo": (fetch_bitinfo_snapshot, (), {"refresh": refresh}),
        "dominance": (fetch_coingecko_dominance, (), {"refresh": refresh}),
        "oi": (fetch_binance_open_interest, (), {"refresh": refresh}),
        "fng": (get_fear_greed_payload, (), {"refresh": refresh}),
        "perp": (_fetch_perp_snapshot, (), {"refresh": refresh}),
        "puell": (compute_puell_multiple, (), {"refresh": refresh}),
        "active_chart": (fetch_blockchain_chart, ("n-unique-addresses", "30days"), {"refresh": refresh}),
        "hash_chart": (fetch_blockchain_chart, ("hash-rate", "30days"), {"refresh": refresh}),
        "netflow": (_fetch_netflow_snapshot, (), {"refresh": refresh}),
        "mempool": (fetch_mempool_fees, (), {"refresh": refresh}),
    }

    data: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            key: pool.submit(_safe_fetch, key, fn, *args, **kwargs)
            for key, (fn, args, kwargs) in jobs.items()
        }
        for key, fut in futures.items():
            timeout = _SNAPSHOT_JOB_TIMEOUTS.get(key, 40)
            try:
                data[key] = fut.result(timeout=timeout)
            except Exception as exc:
                data[key] = {
                    "error": str(exc),
                    "fetchedAt": _now_iso(),
                    "source": key,
                }

    with ThreadPoolExecutor(max_workers=1) as pool:
        bg_fut = pool.submit(_safe_fetch, "bgeometrics", _fetch_bg_kpi_snapshot, refresh=refresh)
        try:
            bg_kpis = bg_fut.result(timeout=25)
        except Exception as exc:
            bg_kpis = {"error": str(exc), "fetchedAt": _now_iso(), "source": "BGeometrics"}

    bitinfo = data["bitinfo"]
    dominance = data["dominance"]
    oi = data["oi"]
    fng = data["fng"]
    perp = data["perp"]
    mvrv = bg_kpis.get("mvrv") or {}
    mvrv_z = bg_kpis.get("mvrv_z_score") or {}
    realized = bg_kpis.get("realized_price") or {}
    hodl = bg_kpis.get("hodl_waves") or {}
    puell = data["puell"]
    active_chart = data["active_chart"]
    hash_chart = data["hash_chart"]
    netflow = data["netflow"]
    mempool = data["mempool"]

    cells = _assemble_snapshot_cells(
        bitinfo=bitinfo,
        dominance=dominance,
        oi=oi,
        fng=fng,
        perp=perp,
        mvrv=mvrv,
        mvrv_z=mvrv_z,
        realized=realized,
        hodl=hodl,
        puell=puell,
        active_chart=active_chart,
        hash_chart=hash_chart,
        netflow=netflow,
        mempool=mempool,
    )

    errors = _collect_errors(
        bitinfo,
        dominance,
        oi,
        netflow,
        mempool,
        hodl,
        puell,
        active_chart,
        hash_chart,
    )
    for key in ("mvrv", "mvrv_z_score", "realized_price", "hodl_waves"):
        payload = bg_kpis.get(key) or {}
        if payload.get("error"):
            errors.append(f"{key}: {payload['error']}")
    payload = _finalize_snapshot_payload(
        cells,
        source_chain=(
            "BitInfoCharts → Blockchain.info → BGeometrics → "
            "Coin Metrics → Mempool.space → Exchanges · Santiment store"
        ),
        fast_path=False,
        from_cache=False,
        refresh=True,
    )
    payload["errors"] = sorted(set(errors + payload.get("errors", [])))
    payload["partial"] = bool(payload["errors"])
    cache_set(cache_key, payload, ttl=300)
    return payload


def _strip_error_if_series(data: dict[str, Any]) -> dict[str, Any]:
    if data.get("series") and data.get("error"):
        return {**data, "error": None}
    return data


def _rehydrate_bundle_charts(
    cached: dict[str, Any],
    series_keys: tuple[str, ...],
) -> dict[str, Any]:
    """Fill empty/error chart slots from disk store when a bundle cache entry is stale."""
    charts = dict(cached.get("charts") or {})
    errors = list(cached.get("errors") or [])
    patched = False
    refresh_registry()
    for key in series_keys:
        chart = charts.get(key) or {}
        if chart.get("series"):
            continue
        if key not in REGISTRY or not REGISTRY[key].enabled:
            continue
        data = get_metric_data(key, refresh=False)
        data = _strip_error_if_series(data)
        if not data.get("series"):
            continue
        charts[key] = _chart_from_payload(key, data)
        errors = [e for e in errors if not e.startswith(f"{key}:")]
        patched = True
    if not patched:
        return cached
    return {
        **cached,
        "charts": charts,
        "errors": sorted(set(errors)),
        "partial": bool(errors),
    }


def _chart_from_payload(key: str, data: dict[str, Any]) -> dict[str, Any]:
    data = _strip_error_if_series(data)
    return {
        "indicator": key,
        "series": data.get("series") or [],
        "latest": data.get("latest"),
        "source": data.get("source"),
        "fetchedAt": data.get("fetchedAt"),
        "error": data.get("error"),
        "stale": data.get("stale"),
        "fromCache": data.get("fromCache"),
        "fromStore": data.get("fromStore"),
        "note": data.get("note"),
    }


def get_flows_payload(*, timespan: str = "all", refresh: bool = False) -> dict[str, Any]:
    cache_key = f"btc:bundle:flows:v1:{timespan}"
    if not refresh:
        cached = cache_get(cache_key, ttl=BGEOMETRICS_TTL)
        if cached is not None:
            return {**cached, "fromCache": True}

    charts: dict[str, dict[str, Any]] = {}
    errors: list[str] = []

    netflow = _safe_fetch("exchange_netflow", fetch_exchange_netflow_series, refresh=refresh)
    charts["exchange_netflow"] = _chart_from_payload("exchange_netflow", netflow)
    if netflow.get("error") and not netflow.get("series"):
        errors.append(f"exchange_netflow: {netflow['error']}")

    for key in ("exchange_inflow", "exchange_outflow", "exchange_balance"):
        data = _safe_fetch(key, fetch_coinmetrics_series, key, refresh=refresh)
        charts[key] = _chart_from_payload(key, data)
        if data.get("error") and not data.get("series"):
            errors.append(f"{key}: {data['error']}")

    etf = _safe_fetch("etf_flow_btc", fetch_bgeometrics_series, "etf_flow_btc", refresh=refresh)
    charts["etf_flow_btc"] = _chart_from_payload("etf_flow_btc", etf)
    if etf.get("error") and not etf.get("series"):
        errors.append(f"etf_flow_btc: {etf['error']}")

    payload = {
        "charts": charts,
        "timespan": timespan,
        "fetchedAt": _now_iso(),
        "errors": sorted(set(errors)),
        "partial": bool(errors),
        "chartInfo": CHART_INFO,
        "sourceChain": "Coin Metrics Community + BGeometrics (sequential)",
    }
    cache_set(cache_key, payload)
    return payload


def get_network_payload(*, timespan: str = "all", refresh: bool = False) -> dict[str, Any]:
    cache_key = f"btc:bundle:network:v1:{timespan}"
    if not refresh:
        cached = cache_get(cache_key, ttl=BGEOMETRICS_TTL)
        if cached is not None:
            return {**cached, "fromCache": True}

    charts: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    for key in NETWORK_SERIES_KEYS:
        data = _safe_fetch(key, fetch_coinmetrics_series, key, refresh=refresh)
        charts[key] = _chart_from_payload(key, data)
        if data.get("error") and not data.get("series"):
            errors.append(f"{key}: {data['error']}")

    mempool = _safe_fetch("mempool", fetch_mempool_fees, refresh=refresh)
    if mempool.get("error"):
        errors.append(f"mempool: {mempool['error']}")

    payload = {
        "charts": charts,
        "mempool": mempool,
        "timespan": timespan,
        "fetchedAt": _now_iso(),
        "errors": sorted(set(errors)),
        "partial": bool(errors),
        "chartInfo": CHART_INFO,
        "sourceChain": "Coin Metrics Community + Mempool.space",
    }
    cache_set(cache_key, payload)
    return payload


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


def get_intelligence_payload(
    *,
    timespan: str = "all",
    refresh: bool = False,
) -> dict[str, Any]:
    cache_key = f"btc:bundle:intelligence:v2:{timespan}"
    if not refresh:
        cached = cache_get(cache_key, ttl=BGEOMETRICS_TTL)
        if cached is not None:
            cached = _rehydrate_bundle_charts(cached, INTELLIGENCE_SERIES_KEYS)
            return {**cached, "fromCache": True}

    charts: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    for key in INTELLIGENCE_SERIES_KEYS:
        # Store-first: only hit live APIs when refresh=True or disk is empty/stale.
        data = get_metric_data(key, refresh=refresh)
        data = _strip_error_if_series(data)
        charts[key] = _chart_from_payload(key, data)
        if data.get("error") and not data.get("series"):
            errors.append(f"{key}: {data['error']}")

    payload = {
        "charts": charts,
        "timespan": timespan,
        "fetchedAt": _now_iso(),
        "errors": sorted(set(errors)),
        "partial": bool(errors),
        "chartInfo": CHART_INFO,
        "sourceChain": "BGeometrics + Santiment · store-first",
    }
    cache_set(cache_key, payload)
    return payload


def get_miner_payload(
    *,
    timespan: str = "all",
    refresh: bool = False,
) -> dict[str, Any]:
    cache_key = f"btc:bundle:miner:v1:{timespan}"
    if not refresh:
        cached = cache_get(cache_key, ttl=BGEOMETRICS_TTL)
        if cached is not None:
            cached = _rehydrate_bundle_charts(cached, MINER_SERIES_KEYS)
            return {**cached, "fromCache": True}

    charts: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    for key in MINER_SERIES_KEYS:
        if key == "puell_multiple" and not refresh:
            stored = get_metric_data("puell_multiple", refresh=False)
            if stored.get("series"):
                data = stored
            else:
                data = _safe_fetch("puell", compute_puell_multiple, refresh=refresh)
        else:
            data = get_metric_data(key, refresh=refresh)
        data = _strip_error_if_series(data)
        charts[key] = _chart_from_payload(key, data)
        if data.get("error") and not data.get("series"):
            errors.append(f"{key}: {data['error']}")

    snapshot = charts.get("blockchair_stats") or {}
    payload = {
        "charts": charts,
        "snapshot": (snapshot.get("series") or [{}])[0].get("snapshot") if snapshot.get("series") else None,
        "timespan": timespan,
        "fetchedAt": _now_iso(),
        "errors": sorted(set(errors)),
        "partial": bool(errors),
        "chartInfo": CHART_INFO,
        "sourceChain": "BGeometrics + Blockchain.info + Blockchair · store-first",
    }
    cache_set(cache_key, payload)
    return payload


def get_valuation_payload(
    *,
    timespan: str = "all",
    refresh: bool = False,
) -> dict[str, Any]:
    """Fetch valuation charts sequentially to respect BGeometrics rate limits."""
    cache_key = f"btc:bundle:valuation:v2:{timespan}"
    if not refresh:
        cached = cache_get(cache_key, ttl=BGEOMETRICS_TTL)
        if cached is not None:
            cached = _rehydrate_bundle_charts(cached, VALUATION_SERIES_KEYS)
            return {**cached, "fromCache": True}

    charts: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    for key in VALUATION_SERIES_KEYS:
        refresh_registry()
        if key in REGISTRY and REGISTRY[key].enabled:
            data = get_metric_data(key, refresh=refresh)
        else:
            data = _safe_fetch("bgeometrics", fetch_bgeometrics_series, key, refresh=refresh)
        data = _strip_error_if_series(data)
        charts[key] = _chart_from_payload(key, data)
        if data.get("error") and not data.get("series"):
            errors.append(f"{key}: {data['error']}")

    payload = {
        "charts": charts,
        "timespan": timespan,
        "fetchedAt": _now_iso(),
        "errors": sorted(set(errors)),
        "partial": bool(errors),
        "chartInfo": CHART_INFO,
        "sourceChain": "BGeometrics · bitcoin-data.com (sequential fetch)",
    }
    cache_set(cache_key, payload)
    return payload


def get_series_payload(
    indicator: str,
    *,
    timespan: str = "all",
    refresh: bool = False,
) -> dict[str, Any]:
    try:
        from btc_data.registry import REGISTRY, refresh_registry

        refresh_registry()
        registry_key = indicator
        if indicator == "hodl_waves_1y_plus":
            registry_key = "hodl_waves"
        if registry_key in REGISTRY and REGISTRY[registry_key].enabled:
            data = get_metric_data(registry_key, refresh=refresh)
            return _finalize_series_payload(indicator, data)

        if indicator == "puell_multiple":
            data = get_metric_data("puell_multiple", refresh=refresh)
            if data.get("series"):
                return _finalize_series_payload(indicator, data)
            data = _safe_fetch("puell", compute_puell_multiple, refresh=refresh)
            return _finalize_series_payload(indicator, data)

        if indicator == "hodl_waves_1y_plus":
            indicator = "hodl_waves"

        if indicator == "exchange_netflow":
            data = _safe_fetch("coinmetrics", fetch_exchange_netflow_series, refresh=refresh)
            return _finalize_series_payload(indicator, data)

        if indicator in COINMETRICS_METRICS:
            data = _safe_fetch("coinmetrics", fetch_coinmetrics_series, indicator, refresh=refresh)
            return _finalize_series_payload(indicator, data)

        if indicator in BGEOMETRICS_SERIES:
            data = _safe_fetch("bgeometrics", fetch_bgeometrics_series, indicator, refresh=refresh)
            return _finalize_series_payload(indicator, data)

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
            return _finalize_series_payload(indicator, data)

        if indicator == "fear_greed":
            from server import get_fear_greed_payload

            fng = _safe_fetch("fear_greed", get_fear_greed_payload, refresh=refresh)
            series = [
                {"timestamp": p["timestamp"], "date": p["date"], "value": float(p["value"])}
                for p in (fng.get("series") or [])
            ]
            return _finalize_series_payload(indicator, {
                "series": series,
                "latest": series[-1] if series else None,
                "source": "Alternative.me",
                "fetchedAt": fng.get("fetchedAt"),
                "error": fng.get("error"),
            })

        if indicator == "btc_dominance":
            data = _safe_fetch(
                "bgeometrics",
                fetch_bgeometrics_series,
                "bitcoin_dominance",
                refresh=refresh,
            )
            return _finalize_series_payload(indicator, data)

        if indicator == "open_interest":
            oi = _safe_fetch("binance", fetch_binance_open_interest, refresh=refresh)
            return _finalize_series_payload(indicator, {
                "series": [{"timestamp": None, "date": "", "value": oi.get("value")}],
                "latest": {"value": oi.get("value")},
                "source": "Binance Futures",
                "fetchedAt": oi.get("fetchedAt"),
                "error": oi.get("error"),
                "note": "Snapshot only — use Derivatives tab for venue breakdown",
            })

        if indicator == "funding_rate":
            from server import get_exchanges_payload

            perp = _safe_fetch("exchanges", get_exchanges_payload, "perp")
            med = _median_funding(perp.get("table") or [])
            return _finalize_series_payload(indicator, {
                "series": [{"timestamp": None, "date": "", "value": med}],
                "latest": {"value": med},
                "source": "Exchange APIs",
                "fetchedAt": perp.get("fetchedAt"),
                "error": perp.get("error"),
                "note": "Cross-venue median snapshot — see Derivatives for history",
            })

        raise ValueError(f"Unknown indicator: {indicator}")
    except ValueError:
        raise
    except Exception as exc:
        return _finalize_series_payload(indicator, {
            "series": [],
            "latest": None,
            "error": str(exc),
            "fetchedAt": _now_iso(),
        })


def get_valuation_models_meta_payload(*, refresh: bool = False) -> dict[str, Any]:
    if refresh:
        clear_all_caches()
    return get_models_meta()


def get_valuation_models_bundle_payload(
    tab: str,
    *,
    refresh: bool = False,
) -> dict[str, Any]:
    return get_tab_bundle(tab, refresh=refresh)


def get_prefetch_status_payload(*, refresh: bool = False) -> dict[str, Any]:
    refresh_registry()
    payload = status_payload()
    payload["catalog"] = registry_payload()
    if refresh:
        payload["refreshBatch"] = run_batch(max_fetches=2, dry_run=False)
    return payload


def get_stored_series_payload(metric_id: str) -> dict[str, Any]:
    stored = get_stored_metric(metric_id)
    if not stored:
        return {
            "metricId": metric_id,
            "series": [],
            "latest": None,
            "error": "Not in local series store — run scripts/btc_prefetch.py",
            "fetchedAt": _now_iso(),
        }
    return {"metricId": metric_id, **stored}