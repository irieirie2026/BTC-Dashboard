"""Shared API routing for local server.py and Vercel serverless."""

from __future__ import annotations

import json
import math
from urllib.parse import parse_qs, urlparse

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
    get_options_chain_payload,
    get_stats_btc_history_payload,
    get_tradfi_payload,
    get_treasury_payload,
)


def _equity_api():
    """Lazy import so missing numpy/pandas only breaks equity routes, not all /api/*."""
    from equity_insights import (
        get_equity_company_payload,
        get_equity_global_payload,
        period_to_dates,
    )

    return get_equity_global_payload, get_equity_company_payload, period_to_dates


def _global_macro_api():
    from global_macro import clear_all_caches as clear_global_macro_cache
    from global_macro import get_global_macro_payload

    return get_global_macro_payload, clear_global_macro_cache


def _macro_drivers_api():
    from macro_drivers_api import (
        clear_all_caches as clear_macro_drivers_api_cache,
        get_liquidity_api_payload,
        get_liquidity_map_api_payload,
        get_map_payload,
        get_meta_payload,
        get_series_payload,
        get_snapshot_payload,
    )

    return {
        "clear": clear_macro_drivers_api_cache,
        "liquidity": get_liquidity_api_payload,
        "liquidity_map": get_liquidity_map_api_payload,
        "map": get_map_payload,
        "meta": get_meta_payload,
        "series": get_series_payload,
        "snapshot": get_snapshot_payload,
    }


def _btc_indicators_api():
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

    return {
        "clear": clear_btc_indicators_cache,
        "distribution": get_distribution_payload,
        "meta": get_btc_meta_payload,
        "series": get_btc_series_payload,
        "snapshot": get_btc_snapshot_payload,
        "flows": get_btc_flows_payload,
        "network": get_btc_network_payload,
        "valuation": get_btc_valuation_payload,
        "intelligence": get_btc_intelligence_payload,
        "miner": get_btc_miner_payload,
        "prefetch_status": get_prefetch_status_payload,
        "stored": get_stored_series_payload,
        "vm_meta": get_valuation_models_meta_payload,
        "vm_bundle": get_valuation_models_bundle_payload,
    }


def resolve_path_and_query(handler):
    parsed = urlparse(handler.path)
    query = parse_qs(parsed.query)

    # Vercel rewrite: /api/(.*) → /api/handler?path=$1
    # path may be "ai/super-summary/paywall" (no leading api/)
    if "path" in query and query["path"][0]:
        raw = query["path"][0].lstrip("/")
        path = raw if raw.startswith("api/") else f"api/{raw}"
        path = "/" + path.lstrip("/")
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


def read_post_json(handler) -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    try:
        data = json.loads(raw.decode("utf-8", errors="replace"))
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def dispatch_api(path, query, body: dict | None = None):
    path = (path or "").split("?")[0].rstrip("/") or "/"

    if path == "/api/equity/global":
        get_equity_global_payload, _, period_to_dates = _equity_api()
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
        _, get_equity_company_payload, period_to_dates = _equity_api()
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
        md = _macro_drivers_api()
        sub = path[len("/api/macro/drivers") :].strip("/") or "snapshot"
        refresh = (query.get("refresh") or ["0"])[0] in ("1", "true", "yes")
        if refresh:
            md["clear"]()
            _, clear_global_macro_cache = _global_macro_api()
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
            return md["snapshot"](
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
            return md["meta"](refresh=refresh)
        if sub == "map":
            return md["map"](
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
            return md["series"](
                indicator=(query.get("indicator") or ["gdp_growth"])[0],
                entities=entities,
                start_year=_int_param("start"),
                end_year=_int_param("end"),
                refresh=refresh,
            )
        if sub == "liquidity/map":
            return md["liquidity_map"](
                metric=(query.get("metric") or ["proxy"])[0],
                year=_int_param("year"),
                refresh=refresh,
            )
        if sub == "liquidity":
            try:
                return md["liquidity"](
                    entity=(query.get("entity") or ["WLD"])[0],
                    year=_int_param("year"),
                    overlay=_bool_param("overlay"),
                    refresh=refresh,
                )
            except Exception as exc:
                return {
                    "error": str(exc)[:200],
                    "entity": (query.get("entity") or ["WLD"])[0],
                    "global": {"series": []},
                    "partial": True,
                }
        raise ValueError(f"Unknown macro drivers endpoint: {sub}")

    if path.startswith("/api/macro/"):
        section = path[len("/api/macro/") :].strip("/")
        if section == "global":
            get_global_macro_payload, clear_global_macro_cache = _global_macro_api()
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
        from macro_drivers_prediction_markets import get_prediction_markets_payload

        return get_prediction_markets_payload(refresh=refresh, mock_only=mock_only)

    if path == "/api/law" or path.startswith("/api/law/"):
        from law_data import get_law_payload

        jid = None
        if path.startswith("/api/law/") and len(path) > len("/api/law/"):
            jid = path[len("/api/law/") :].strip("/")
        if not jid:
            jid = (query.get("jurisdiction") or query.get("id") or [None])[0]
        return get_law_payload(jurisdiction=jid or None)

    if path == "/api/home/motto-tts":
        from home_tts import motto_tts_payload

        result = motto_tts_payload(refresh=_query_refresh(query))
        if result.get("ok") and result.get("bytes"):
            return {
                "__binary__": True,
                "contentType": result.get("contentType") or "audio/mpeg",
                "bytes": result["bytes"],
                "cacheControl": "public, max-age=86400" if result.get("cached") else "public, max-age=3600",
                "headers": {
                    "X-TTS-Voice": str(result.get("voice") or ""),
                    "X-TTS-Model": str(result.get("model") or "grok-tts"),
                    "X-TTS-Engine": str(result.get("engine") or ""),
                    "X-TTS-Cached": "1" if result.get("cached") else "0",
                },
            }
        # JSON error so the client can fall back to browser speech
        return {
            "ok": False,
            "error": result.get("error") or "TTS unavailable",
            "fallback": result.get("fallback") or "browser",
        }

    if path == "/api/cross-market/snapshot":
        refresh = _query_refresh(query)
        try:
            from cross_market import get_cross_market_snapshot

            payload = get_cross_market_snapshot(refresh=refresh)
            if isinstance(payload, dict) and payload.get("venues") and not payload.get("demo"):
                if not payload.get("fallback"):
                    return payload
                ref = payload.get("referenceUsd")
                if ref is not None and abs(float(ref) - 94250) >= 400:
                    return payload
            raise ValueError("cross-market returned demo or empty snapshot")
        except Exception as exc:
            try:
                from cross_market import build_snapshot_from_exchange_payloads

                spot = get_exchanges_payload("spot", refresh=True)
                perp = get_exchanges_payload("perp", refresh=True)
                return build_snapshot_from_exchange_payloads(
                    spot, perp, errors=[str(exc)], partial=True
                )
            except Exception:
                pass
            try:
                from cross_market import get_sample_payload

                payload = get_sample_payload()
                if isinstance(payload, dict):
                    payload = dict(payload)
                    payload["errors"] = [str(exc)]
                    payload["fallback"] = True
                    payload["demo"] = True
                    return payload
            except Exception:
                pass
            raise

    if path == "/api/cross-market/news":
        from cross_market import get_cross_market_news

        return get_cross_market_news(body)

    if path == "/api/cross-market/alert":
        from cross_market_alerts import dispatch_alert

        return dispatch_alert(body)

    if path == "/api/cross-market/history":
        from cross_market_history import append_events, get_history

        if body is not None:
            events = body.get("events") if isinstance(body, dict) else None
            return append_events(events or [])
        days_raw = (query.get("days") or ["7"])[0]
        limit_raw = (query.get("limit") or ["2000"])[0]
        return get_history(
            days=int(days_raw) if str(days_raw).isdigit() else 7,
            limit=int(limit_raw) if str(limit_raw).isdigit() else 2000,
        )

    if path == "/api/cross-market/sample":
        from cross_market import get_sample_payload

        return get_sample_payload()

    if path.startswith("/api/exchanges/"):
        section = path[len("/api/exchanges/") :].strip("/")
        refresh = _query_refresh(query)
        return get_exchanges_payload(section, refresh=refresh)

    if path.startswith("/api/news/"):
        section = path[len("/api/news/") :].strip("/")
        refresh = _query_refresh(query)
        return get_news_payload(section, refresh=refresh)

    if path == "/api/misc/metrics" or path.startswith("/api/misc/metrics/"):
        refresh = (query.get("refresh") or ["0"])[0] in ("1", "true", "yes")
        from macro_data.misc_metrics import get_misc_metrics_payload

        return get_misc_metrics_payload(refresh=refresh)

    if path == "/api/misc/whales" or path.startswith("/api/misc/whales/"):
        refresh = (query.get("refresh") or ["0"])[0] in ("1", "true", "yes")
        from macro_data.misc_whales import get_misc_whales_payload

        return get_misc_whales_payload(refresh=refresh)

    if path == "/api/misc/knowledge-graph/ingest":
        from macro_data.knowledge_graph import process_ingest

        return process_ingest(body or {})

    if path == "/api/misc/knowledge-graph/extract":
        from macro_data.knowledge_graph import process_extract

        return process_extract(body or {})

    if path == "/api/misc/knowledge-graph/discover":
        from macro_data.knowledge_graph import process_discover

        return process_discover(body or {})

    if path == "/api/misc/knowledge-graph/rag":
        from macro_data.knowledge_graph import process_rag

        return process_rag(body or {})

    if path == "/api/misc/fear-greed":
        refresh = (query.get("refresh") or ["0"])[0] in ("1", "true", "yes")
        return get_fear_greed_payload(refresh=refresh)

    if path == "/api/misc/mempool":
        from btc_data.fetchers import fetch_mempool_fees

        return fetch_mempool_fees(refresh=_query_refresh(query))

    if path == "/api/misc/btc" or path.startswith("/api/misc/btc/"):
        try:
            btc = _btc_indicators_api()
        except ImportError as exc:
            return {"error": f"BTC indicators unavailable: {exc}", "cells": {}, "models": []}
        sub = path[len("/api/misc/btc") :].strip("/") or "snapshot"
        refresh = (query.get("refresh") or ["0"])[0] in ("1", "true", "yes")
        if refresh:
            btc["clear"]()
        if sub in ("", "snapshot"):
            try:
                return btc["snapshot"](refresh=refresh)
            except Exception as exc:
                return {
                    "error": str(exc)[:200],
                    "cells": {},
                    "fetchedAt": None,
                    "sourceChain": "Store-first snapshot",
                    "partial": True,
                }
        if sub == "meta":
            return btc["meta"](refresh=refresh)
        if sub == "distribution":
            return btc["distribution"](refresh=refresh)
        if sub == "series":
            indicator = (query.get("indicator") or [""])[0]
            # Full history by default; client zooms interactively. Disk cache keyed by timespan.
            timespan = (query.get("timespan") or ["all"])[0]
            if not indicator:
                raise ValueError("Missing indicator parameter")
            return btc["series"](indicator, timespan=timespan, refresh=refresh)
        if sub == "valuation":
            timespan = (query.get("timespan") or ["all"])[0]
            return btc["valuation"](timespan=timespan, refresh=refresh)
        if sub == "flows":
            timespan = (query.get("timespan") or ["all"])[0]
            return btc["flows"](timespan=timespan, refresh=refresh)
        if sub == "network":
            timespan = (query.get("timespan") or ["all"])[0]
            return btc["network"](timespan=timespan, refresh=refresh)
        if sub == "intelligence":
            timespan = (query.get("timespan") or ["all"])[0]
            return btc["intelligence"](timespan=timespan, refresh=refresh)
        if sub == "miner":
            timespan = (query.get("timespan") or ["all"])[0]
            return btc["miner"](timespan=timespan, refresh=refresh)
        if sub == "valuation-models/meta":
            return btc["vm_meta"](refresh=refresh)
        if sub == "valuation-models/bundle":
            tab = (query.get("tab") or query.get("category") or [""])[0]
            if not tab:
                raise ValueError("Missing tab parameter")
            return btc["vm_bundle"](tab, refresh=refresh)
        if sub == "prefetch/status":
            return btc["prefetch_status"](refresh=refresh)
        if sub == "stored":
            metric_id = (query.get("metric") or [""])[0]
            if not metric_id:
                raise ValueError("Missing metric parameter")
            return btc["stored"](metric_id)
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

    if path == "/api/stats/correlation" or path.startswith("/api/stats/correlation/"):
        from stats_correlation import get_correlation_payload

        refresh = _query_refresh(query)
        period = ((query.get("period") or ["max"])[0] or "max").strip().lower()
        if period not in ("2y", "5y", "10y", "max"):
            period = "max"
        return get_correlation_payload(refresh=refresh, period=period)

    if path == "/api/stats/volatility" or path.startswith("/api/stats/volatility/"):
        try:
            from volatility_models import (
                get_volatility_model_payload,
                get_volatility_suite_payload,
                list_volatility_catalog,
            )
        except ImportError as exc:
            return {
                "error": f"Volatility module unavailable: {exc}",
                "catalog": [],
                "models": [],
            }

        refresh = _query_refresh(query)
        days_raw = (query.get("days") or ["1095"])[0]
        try:
            days = int(days_raw)
        except (TypeError, ValueError):
            days = 1095
        days = max(90, min(days, 5000))
        dist = ((query.get("dist") or ["t"])[0] or "t").strip().lower()
        sub = path[len("/api/stats/volatility") :].strip("/")
        if sub == "catalog":
            return {
                "catalog": list_volatility_catalog(),
                "distributions": [
                    {"id": "t", "name": "Student-t"},
                    {"id": "normal", "name": "Normal"},
                    {"id": "ged", "name": "GED"},
                    {"id": "skewt", "name": "Skewed-t"},
                ],
                "archAvailable": __import__(
                    "volatility_models", fromlist=["ARCH_AVAILABLE"]
                ).ARCH_AVAILABLE,
            }
        if sub and sub not in ("suite", "all"):
            return get_volatility_model_payload(
                sub, days=days, dist=dist, refresh=refresh
            )
        models_raw = (query.get("models") or [""])[0]
        models = [m.strip() for m in models_raw.split(",") if m.strip()] or None
        return get_volatility_suite_payload(
            days=days, dist=dist, models=models, refresh=refresh
        )

    if path == "/api/stats/timeseries" or path.startswith("/api/stats/timeseries/"):
        try:
            from timeseries_models import (
                get_timeseries_model_payload,
                get_timeseries_suite_payload,
            )
        except ImportError as exc:
            return {
                "error": f"Time series module unavailable: {exc}",
                "models": [],
            }

        refresh = _query_refresh(query)
        days_raw = (query.get("days") or ["3650"])[0]
        try:
            days = int(days_raw)
        except (TypeError, ValueError):
            days = 3650
        days = max(180, min(days, 8000))
        sub = path[len("/api/stats/timeseries") :].strip("/")
        if sub and sub not in ("suite", "all"):
            return get_timeseries_model_payload(sub, days=days, refresh=refresh)
        models_raw = (query.get("models") or [""])[0]
        models = [m.strip() for m in models_raw.split(",") if m.strip()] or None
        try:
            return get_timeseries_suite_payload(
                days=days, models=models, refresh=refresh
            )
        except Exception as exc:
            return {
                "error": str(exc)[:240],
                "models": [],
                "daysRequested": days,
            }

    if path == "/api/market" or path.startswith("/api/market/"):
        from market_feed import (
            get_eth_daily,
            get_futures_snapshot,
            get_klines,
            get_perp_snapshot,
            get_spot_bundle,
            get_spot_quote,
        )

        refresh = _query_refresh(query)
        sub = path[len("/api/market") :].strip("/") or "quote"
        if sub in ("", "quote", "ticker"):
            return get_spot_quote(refresh=refresh)
        if sub in ("spot", "bundle"):
            return get_spot_bundle(refresh=refresh)
        if sub == "klines":
            interval = (query.get("interval") or ["1m"])[0]
            try:
                limit = int((query.get("limit") or ["500"])[0])
            except (TypeError, ValueError):
                limit = 500
            product = (query.get("product") or ["BTC-USD"])[0]
            return get_klines(interval=interval, limit=limit, product=product, refresh=refresh)
        if sub in ("eth", "eth-daily"):
            return get_eth_daily(refresh=refresh)
        if sub == "perp":
            return get_perp_snapshot(refresh=refresh)
        if sub in ("futures", "delivery"):
            return get_futures_snapshot(refresh=refresh)
        return {"error": f"Unknown market endpoint: {sub}", "venues": ["Coinbase", "Kraken", "OKX"]}

    if path == "/api/options":
        return get_options_payload(refresh=_query_refresh(query))

    if path == "/api/options/chain":
        return get_options_chain_payload(refresh=_query_refresh(query))

    # Super Summary family — normalize so /api/ai/... and bare ai/... both work
    # (local server uses full path; Vercel rewrite may pass path=ai/super-summary/...)
    ss_path = path if path.startswith("/") else f"/{path}"
    if not ss_path.startswith("/api/") and (
        ss_path.startswith("/ai/") or ss_path.startswith("ai/")
    ):
        ss_path = "/api" + (ss_path if ss_path.startswith("/") else f"/{ss_path}")
    ss_path = ss_path.rstrip("/") or "/"

    if ss_path == "/api/ai/super-summary/paywall" or ss_path.endswith(
        "/super-summary/paywall"
    ):
        from super_summary_paywall import get_paywall_public_config

        return get_paywall_public_config()

    if ss_path == "/api/ai/super-summary/unlock" or ss_path.endswith(
        "/super-summary/unlock"
    ):
        from super_summary_paywall import try_unlock

        unlock_body = body if isinstance(body, dict) else {}
        return try_unlock(
            option_id=str(unlock_body.get("optionId") or unlock_body.get("option") or ""),
            tx_hash=str(unlock_body.get("txHash") or unlock_body.get("tx") or ""),
            dev_code=unlock_body.get("devCode") or unlock_body.get("dev_code"),
        )

    if ss_path == "/api/ai/super-summary" or ss_path.endswith("/super-summary"):
        from super_summary import get_super_summary_payload
        from super_summary_paywall import paywall_enabled, require_super_summary_access

        force = False
        unlock_token = None
        if body and isinstance(body, dict):
            force = bool(body.get("force") or body.get("refresh"))
            unlock_token = body.get("unlockToken") or body.get("accessToken")
        force = force or _query_refresh(query)
        if not unlock_token:
            unlock_token = (query.get("unlockToken") or query.get("token") or [None])[0]

        if paywall_enabled():
            access = require_super_summary_access(unlock_token)
            if not access.get("ok"):
                from super_summary_paywall import get_paywall_public_config

                return {
                    "error": "payment_required",
                    "message": "Unlock the Final Report with 1 USDT or 1 USDC.",
                    "paywall": get_paywall_public_config(),
                    "accessError": access.get("error"),
                }

        return get_super_summary_payload(refresh=force, force=force)

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


def send_binary(handler, status, payload: dict):
    raw = payload.get("bytes") or b""
    if not isinstance(raw, (bytes, bytearray)):
        raw = bytes(raw)
    try:
        handler.send_response(status)
        handler.send_header("Content-Type", payload.get("contentType") or "application/octet-stream")
        handler.send_header("Access-Control-Allow-Origin", "*")
        handler.send_header("Cache-Control", payload.get("cacheControl") or "public, max-age=3600")
        handler.send_header("Content-Length", str(len(raw)))
        for hk, hv in (payload.get("headers") or {}).items():
            if hv is not None and str(hv):
                handler.send_header(str(hk), str(hv))
        handler.end_headers()
        handler.wfile.write(raw)
    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
        return


def handle_api(handler):
    path, query = resolve_path_and_query(handler)
    body = read_post_json(handler) if handler.command == "POST" else None
    try:
        payload = dispatch_api(path, query, body)
        if isinstance(payload, dict) and payload.get("__binary__"):
            send_binary(handler, 200, payload)
        else:
            send_json(handler, 200, payload)
    except ValueError as exc:
        send_json(handler, 404, {"error": str(exc)})
    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
        return
    except Exception as exc:
        send_json(handler, 502, {"error": str(exc)})