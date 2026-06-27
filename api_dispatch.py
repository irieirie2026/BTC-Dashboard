"""Shared API routing for local server.py and Vercel serverless."""

import json
from urllib.parse import parse_qs, urlparse

from server import (
    _parse_tradfi_symbol_list,
    get_defi_payload,
    get_etf_payload,
    get_exchanges_payload,
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


def dispatch_api(path, query):
    if path.startswith("/api/tradfi/"):
        section = path[len("/api/tradfi/") :].strip("/")
        heroes_override = None
        symbols_override = None
        if section in ("stocks-companies", "stocks-indices"):
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
        )

    if path.startswith("/api/defi/"):
        section = path[len("/api/defi/") :].strip("/")
        return get_defi_payload(section)

    if path.startswith("/api/macro/"):
        section = path[len("/api/macro/") :].strip("/")
        return get_macro_payload(section)

    if path.startswith("/api/exchanges/"):
        section = path[len("/api/exchanges/") :].strip("/")
        return get_exchanges_payload(section)

    if path.startswith("/api/news/"):
        section = path[len("/api/news/") :].strip("/")
        return get_news_payload(section)

    if path == "/api/onchain/chart":
        name = (query.get("name") or [None])[0]
        timespan = (query.get("timespan") or ["30days"])[0]
        if not name:
            raise ValueError("Missing chart name")
        return get_onchain_chart_payload(name, timespan)

    static_routes = {
        "/api/etf": get_etf_payload,
        "/api/treasury": get_treasury_payload,
        "/api/options": get_options_payload,
        "/api/stats/btc-history": get_stats_btc_history_payload,
    }
    if path in static_routes:
        return static_routes[path]()

    raise ValueError(f"Unknown API route: {path}")


def send_json(handler, status, payload):
    body = json.dumps(payload, default=str).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Cache-Control", "public, max-age=300")
    handler.end_headers()
    handler.wfile.write(body)


def handle_api(handler):
    path, query = resolve_path_and_query(handler)
    try:
        payload = dispatch_api(path, query)
        send_json(handler, 200, payload)
    except ValueError as exc:
        send_json(handler, 404, {"error": str(exc)})
    except Exception as exc:
        send_json(handler, 502, {"error": str(exc)})