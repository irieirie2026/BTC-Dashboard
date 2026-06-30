"""Shared API routing for local server.py and Vercel serverless."""

from __future__ import annotations

import json
import math
from urllib.parse import parse_qs, urlparse

from equity_insights import (
    get_equity_company_payload,
    get_equity_global_payload,
    period_to_dates,
)
from global_macro import clear_all_caches as clear_global_macro_cache
from global_macro import get_global_macro_payload
from macro_drivers_api import (
    clear_all_caches as clear_macro_drivers_api_cache,
    get_liquidity_api_payload,
    get_liquidity_map_api_payload,
    get_map_payload,
    get_meta_payload,
    get_series_payload,
    get_snapshot_payload,
)
from btc_indicators_api import (
    clear_all_caches as clear_btc_indicators_cache,
    get_distribution_payload,
    get_meta_payload as get_btc_meta_payload,
    get_series_payload as get_btc_series_payload,
    get_snapshot_payload as get_btc_snapshot_payload,
    get_flows_payload as get_btc_flows_payload,
    get_network_payload as get_btc_network_payload,
    get_valuation_payload as get_btc_valuation_payload,
    get_intelligence_payload as get_btc_intelligence_payload,
    get_miner_payload as get_btc_miner_payload,
    get_prefetch_status_payload,
    get_stored_series_payload,
    get_valuation_models_meta_payload,
    get_valuation_models_bundle_payload,
)
from server import (
    _parse_tradfi_symbol_list,
    get_defi_payload,
    get_etf_payload,
    get_exchanges_payload,
    get_fear_greed_payload,
    get_macro_payload,
    get_news_payload,
    get_onchain_chart_payload,
    get_options_payload,
    get_stats_btc_history_payload,
    get_tradfi_payload,
    get_treasury_payload,
)


def resolve_path_and_query(handler):
    parsed = urlparse(handler.path)
    query = parse_qs(parsed.query)

    if "path" in query and query["path"][0]:
        path = "/api/" + query["path"][0].lstrip("/")
        return path, query

    for header in (
        "X-Vercel-Original-URL",
        "X-Original-URL",
        "X-Forwarded-Uri",
        "x-invoke-path",
    ):
        raw = handler.headers.get(header)
        if not raw:
            continue
        hp = urlparse(raw)
        if hp.path.startswith("/api/"):
            return hp.path, parse_qs(hp.query)

    return parsed.path.split("?")[0], query


def _query_refresh(query) -> bool:
    return (query.get("refresh") or ["0"])[0] in ("1", "true", "yes")


def dispatch_api(path, query):
    path = (path or "").split("?")[0].rstrip("/") or "/"

    if path == "/api/equity/global":
        refresh = _query_refresh(query)
        symbols = _parse_tradfi_symbol_list(
            (query.get("symbols") or [""])[0], max_count=20
        )
        heroes = _parse_tradfi_symbol_list(
            (query.get("heroes") or [""])[0], max_count=4
        )
        start = (query.get("start") or [None])[0]
        end = (query.get("end") or [None])[0]
        period = (query.get("period") or ["5Y"])[0]
        perf_period = (query.get("perfPeriod") or ["1Y"])[0]
        movers = (query.get("movers") or ["YTD"])[0]
        if not start or not end:
            start, end = period_to_dates(period, None, None)
        return get_equity_global_payload(
            symbols, start, end, movers, period, heroes, perf_period, refresh=refresh
        )

    if path == "/api/equity/company":
        refresh = _query_refresh(query)
        symbol = ((query.get("symbol") or [""])[0]).strip().upper()
        peers = _parse_tradfi_symbol_list(
            (query.get("peers") or [""])[0], max_count=12
        )
        start = (query.get("start") or [None])[0]
        end = (query.get("end") or [None])[0]
        period = (query.get("period") or ["1Y"])[0]
        if not start or not end:
            start, end = period_to_dates(period, None, None)
        return get_equity_company_payload(symbol, peers, start, end, period, refresh=refresh)

    if path.startswith("/api/tradfi/"):
        refresh = _query_refresh(query)
        section = path[len("/api/tradfi/") :].strip("/")
        heroes_override = None
        symbols_override = None
        if section in (
            "stocks-companies",
            "stocks-indices",
            "futures",
            "rates",
            "currencies",
            "commodities",
            "sectors",
            "energy",
        ):
            if "heroes" in query:
                heroes_override = _parse_tradfi_symbol_list(
                    query["heroes"][0], max_count=4
                )
            if "symbols" in query:
                symbols_override = _parse_tradfi_symbol_list(
                    query["symbols"][0], max_count=50
                )
        return get_tradfi_payload(
            section,
            heroes_override=heroes_override,
            symbols_override=symbols_override,
            refresh=refresh,
        )

    if path.startswith("/api/defi/"):
        section = path[len("/api/defi/") :].strip("/")
        refresh = _query_refresh(query)
        return get_defi_payload(section, refresh=refresh)

    if path == "/api/macro/drivers" or path.startswith("/api/macro/drivers/"):
        sub = path[len("/api/macro/drivers") :].strip("/") or "snapshot"
        refresh = (query.get("refresh") or ["0"])[0] in ("1", "true", "yes")
        if refresh:
            clear_macro_drivers_api_cache()
            clear_global_macro_cache()

        def _int_param(name: str) -> int | None:
            raw = (query.get(name) or [None])[0]
            return int(raw) if raw and str(raw).isdigit() else None

        def _bool_param(name: str, default: bool = False) -> bool:
            raw = (query.get(name) or [None])[0]
            if raw is None:
                return default
            return str(raw).lower() in ("1", "true", "yes")

        if sub in ("", "snapshot"):
            return get_snapshot_payload(
                year=_int_param("year"),
                region=(query.get("region") or [""])[0],
                income=(query.get("income") or [""])[0],
                show_aggregates=_bool_param("aggregates", True),
                featured_only=_bool_param("featuredAggs"),
                search=(query.get("search") or [""])[0],
                tab=(query.get("tab") or [""])[0],
                refresh=refresh,
            )
        if sub == "meta":
            return get_meta_payload(refresh=refresh)
        if sub == "map":
            return get_map_payload(
                metric=(query.get("metric") or ["gdp_growth"])[0],
                year=_int_param("year"),
                region=(query.get("region") or [""])[0],
                income=(query.get("income") or [""])[0],
                refresh=refresh,
            )
        if sub == "series":
            entities = [
                e.strip()
                for e in (query.get("entities") or [""])[0].split(",")
                if e.strip()
            ]
            return get_series_payload(
                indicator=(query.get("indicator") or ["gdp_growth"])[0],
                entities=entities,
                start_year=_int_param("start"),
                end_year=_int_param("end"),
                refresh=refresh,
            )
        if sub == "liquidity/map":
            return get_liquidity_map_api_payload(
                metric=(query.get("metric") or ["proxy"])[0],
                year=_int_param("year"),
                refresh=refresh,
            )
        if sub == "liquidity":
            return get_liquidity_api_payload(
                entity=(query.get("entity") or ["WLD"])[0],
                year=_int_param("year"),
                overlay=_bool_param("overlay"),
                refresh=refresh,
            )
        raise ValueError(f"Unknown macro drivers endpoint: {sub}")

    if path.startswith("/api/macro/"):
        section = path[len("/api/macro/") :].strip("/")
        if section == "global":
            refresh = (query.get("refresh") or ["0"])[0] in ("1", "true", "yes")
            year_raw = (query.get("year") or [None])[0]
            year = int(year_raw) if year_raw and str(year_raw).isdigit() else None
            if refresh:
                clear_global_macro_cache()
            return get_global_macro_payload(refresh=refresh, year=year)
        refresh = _query_refresh(query)
        return get_macro_payload(section, refresh=refresh)

    if path == "/api/prediction-markets":
        refresh = _query_refresh(query)
        mock_only = (query.get("mock") or ["0"])[0] in ("1", "true", "yes")
        from prediction_markets_api import get_prediction_markets_payload

        return get_prediction_markets_payload(refresh=refresh, mock_only=mock_only)

    if path.startswith("/api/exchanges/"):
        section = path[len("/api/exchanges/") :].strip("/")
        refresh = _query_refresh(query)
        return get_exchanges_payload(section, refresh=refresh)

    if path.startswith("/api/news/"):
        section = path[len("/api/news/") :].strip("/")
        refresh = _query_refresh(query)
        return get_news_payload(section, refresh=refresh)

    if path == "/api/misc/fear-greed":
        refresh = (query.get("refresh") or ["0"])[0] in ("1", "true", "yes")
        return get_fear_greed_payload(refresh=refresh)

    if path == "/api/misc/btc" or path.startswith("/api/misc/btc/"):
        sub = path[len("/api/misc/btc") :].strip("/") or "snapshot"
        refresh = (query.get("refresh") or ["0"])[0] in ("1", "true", "yes")
        if refresh:
            clear_btc_indicators_cache()
        if sub in ("", "snapshot"):
            return get_btc_snapshot_payload(refresh=refresh)
        if sub == "meta":
            return get_btc_meta_payload(refresh=refresh)
        if sub == "distribution":
            return get_distribution_payload(refresh=refresh)
        if sub == "series":
            indicator = (query.get("indicator") or [""])[0]
            timespan = (query.get("timespan") or ["1year"])[0]
            if not indicator:
                raise ValueError("Missing indicator parameter")
            return get_btc_series_payload(indicator, timespan=timespan, refresh=refresh)
        if sub == "valuation":
            timespan = (query.get("timespan") or ["1year"])[0]
            return get_btc_valuation_payload(timespan=timespan, refresh=refresh)
        if sub == "flows":
            timespan = (query.get("timespan") or ["1year"])[0]
            return get_btc_flows_payload(timespan=timespan, refresh=refresh)
        if sub == "network":
            timespan = (query.get("timespan") or ["1year"])[0]
            return get_btc_network_payload(timespan=timespan, refresh=refresh)
        if sub == "intelligence":
            timespan = (query.get("timespan") or ["1year"])[0]
            return get_btc_intelligence_payload(timespan=timespan, refresh=refresh)
        if sub == "miner":
            timespan = (query.get("timespan") or ["1year"])[0]
            return get_btc_miner_payload(timespan=timespan, refresh=refresh)
        if sub == "valuation-models/meta":
            return get_valuation_models_meta_payload(refresh=refresh)
        if sub == "valuation-models/bundle":
            tab = (query.get("tab") or query.get("category") or [""])[0]
            if not tab:
                raise ValueError("Missing tab parameter")
            return get_valuation_models_bundle_payload(tab, refresh=refresh)
        if sub == "prefetch/status":
            return get_prefetch_status_payload(refresh=refresh)
        if sub == "stored":
            metric_id = (query.get("metric") or [""])[0]
            if not metric_id:
                raise ValueError("Missing metric parameter")
            return get_stored_series_payload(metric_id)
        raise ValueError(f"Unknown BTC indicators endpoint: {sub}")

    if path == "/api/onchain/chart":
        name = (query.get("name") or [None])[0]
        timespan = (query.get("timespan") or ["30days"])[0]
        if not name:
            raise ValueError("Missing chart name")
        return get_onchain_chart_payload(name, timespan)

    if path == "/api/cache/stats":
        from cache.legacy import clear_legacy_cache
        from cache.service import get_cache_service, reset_stats

        if _query_refresh(query):
            reset_stats()
        cleared = 0
        prefix = (query.get("prefix") or [""])[0].strip()
        if prefix:
            cleared = clear_legacy_cache(prefix)
        stats = get_cache_service().stats()
        if prefix:
            stats["invalidated"] = cleared
            stats["prefix"] = prefix
        return stats

    if path == "/api/etf":
        return get_etf_payload(refresh=_query_refresh(query))

    if path == "/api/treasury":
        return get_treasury_payload(refresh=_query_refresh(query))

    if path == "/api/stats/btc-history":
        return get_stats_btc_history_payload(refresh=_query_refresh(query))

    if path == "/api/options":
        return get_options_payload(refresh=_query_refresh(query))

    raise ValueError(f"Unknown API route: {path}")


def _sanitize_json_value(value):
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, dict):
        return {k: _sanitize_json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize_json_value(v) for v in value]
    return value


def send_json(handler, status, payload):
    safe_payload = _sanitize_json_value(payload)
    body = json.dumps(safe_payload, default=str, allow_nan=False).encode()
    try:
        handler.send_response(status)
        handler.send_header("Content-Type", "application/json")
        handler.send_header("Access-Control-Allow-Origin", "*")
        handler.send_header("Cache-Control", "public, max-age=300")
        handler.end_headers()
        handler.wfile.write(body)
    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
        # Client disconnected (duplicate/aborted fetch) — response already irrelevant.
        return


def handle_api(handler):
    path, query = resolve_path_and_query(handler)
    try:
        payload = dispatch_api(path, query)
        send_json(handler, 200, payload)
    except ValueError as exc:
        send_json(handler, 404, {"error": str(exc)})
    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
        return
    except Exception as exc:
        send_json(handler, 502, {"error": str(exc)})