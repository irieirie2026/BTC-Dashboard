"""Dune Analytics API adapter — community queries via DUNE_API_KEY + query IDs."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

from btc_data.registry import _parse_dune_queries
from macro_data.cache import cache_get, cache_set

DUNE_BASE = "https://api.dune.com/api/v1"
DUNE_TTL = 86_400


def _api_key() -> str:
    return os.environ.get("DUNE_API_KEY", "").strip()


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _dune_request(method: str, path: str, body: dict | None = None) -> Any:
    key = _api_key()
    url = f"{DUNE_BASE}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "X-Dune-API-Key": key,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _query_config(query_id: str) -> dict[str, Any] | None:
    for row in _parse_dune_queries():
        if str(row.get("queryId")) == str(query_id):
            return row
    return None


def _normalize_results(raw: dict[str, Any], cfg: dict[str, Any] | None) -> list[dict]:
    rows = (raw.get("result") or {}).get("rows") or raw.get("rows") or []
    if not isinstance(rows, list):
        return []
    time_col = (cfg or {}).get("timeColumn") or "day"
    value_col = (cfg or {}).get("valueColumn") or "value"
    alt_value_cols = (cfg or {}).get("valueColumns") or []
    series: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        val = row.get(value_col)
        if val is None and alt_value_cols:
            for col in alt_value_cols:
                if row.get(col) is not None:
                    val = row[col]
                    break
        if val is None:
            for k, v in row.items():
                if k == time_col or k in ("date", "dt", "time"):
                    continue
                if isinstance(v, (int, float)):
                    val = v
                    break
        if val is None:
            continue
        date_raw = row.get(time_col) or row.get("date") or row.get("time") or row.get("dt")
        date_str = str(date_raw)[:10] if date_raw else ""
        ts = None
        if date_str:
            try:
                ts = int(time.mktime(time.strptime(date_str[:10], "%Y-%m-%d")))
            except ValueError:
                pass
        series.append({"timestamp": ts, "date": date_str, "value": float(val), "raw": row})
    series.sort(key=lambda p: p.get("timestamp") or 0)
    return series


def fetch(spec, *, refresh: bool = False) -> dict[str, Any]:
    query_id = spec.source_key
    cache_key = f"btc:dune:v1:{query_id}"
    if not refresh:
        cached = cache_get(cache_key, ttl=DUNE_TTL)
        if cached:
            return {**cached, "fromCache": True}

    if not _api_key():
        return {
            "series": [],
            "latest": None,
            "source": "Dune Analytics",
            "error": "Set DUNE_API_KEY in .env.local",
            "fetchedAt": _now_iso(),
        }
    if not query_id:
        return {
            "series": [],
            "latest": None,
            "source": "Dune Analytics",
            "error": "Set BTC_DUNE_QUERY_IDS=metric_name:12345 in .env.local",
            "fetchedAt": _now_iso(),
        }

    cfg = _query_config(query_id)
    try:
        exec_resp = _dune_request("POST", f"/query/{query_id}/execute", {})
        execution_id = exec_resp.get("execution_id")
        if not execution_id:
            raise RuntimeError(f"Dune execute failed: {exec_resp}")

        deadline = time.time() + 120
        state = "QUERY_STATE_PENDING"
        while time.time() < deadline:
            status = _dune_request("GET", f"/execution/{execution_id}/status")
            state = status.get("state") or status.get("execution_state") or ""
            if state in ("QUERY_STATE_COMPLETED", "EXECUTION_STATE_COMPLETED"):
                break
            if state in ("QUERY_STATE_FAILED", "EXECUTION_STATE_FAILED"):
                raise RuntimeError(f"Dune execution failed: {status}")
            time.sleep(2)

        results = _dune_request("GET", f"/execution/{execution_id}/results")
        series = _normalize_results(results, cfg)
        payload = {
            "series": series,
            "latest": series[-1] if series else None,
            "source": "Dune Analytics",
            "fetchedAt": _now_iso(),
            "note": f"Query {query_id} — consumes Dune credits on free plan",
            "executionId": execution_id,
        }
        cache_set(cache_key, payload)
        return payload
    except urllib.error.HTTPError as exc:
        msg = exc.read().decode("utf-8", errors="replace")[:300]
        stale = cache_get(cache_key, ttl=DUNE_TTL * 7)
        if stale:
            return {**stale, "stale": True, "error": msg}
        return {"series": [], "latest": None, "source": "Dune Analytics", "error": msg, "fetchedAt": _now_iso()}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
        stale = cache_get(cache_key, ttl=DUNE_TTL * 7)
        if stale:
            return {**stale, "stale": True, "error": str(exc)}
        return {"series": [], "latest": None, "source": "Dune Analytics", "error": str(exc), "fetchedAt": _now_iso()}