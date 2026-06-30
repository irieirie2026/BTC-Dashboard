"""Santiment GraphQL adapter (free plan — requires SANTIMENT_API_KEY)."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

from macro_data.cache import cache_get, cache_set

SANTIMENT_API = "https://api.santiment.net/graphql"
SANTIMENT_TTL = 21_600
SLUG = "bitcoin"


def _api_key() -> str:
    return os.environ.get("SANTIMENT_API_KEY", "").strip()


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _graphql(query: str, variables: dict[str, Any]) -> dict[str, Any]:
    key = _api_key()
    if not key:
        return {"error": "SANTIMENT_API_KEY not set"}
    body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(
        SANTIMENT_API,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Apikey {key}",
            # Cloudflare returns 403 / error 1010 without a normal User-Agent.
            "User-Agent": "BTC-Dashboard/1.0 (Santiment GraphQL client)",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def fetch(spec, *, refresh: bool = False) -> dict[str, Any]:
    metric = spec.source_key
    cache_key = f"btc:santiment:v1:{metric}"
    if not refresh:
        cached = cache_get(cache_key, ttl=SANTIMENT_TTL)
        if cached:
            return {**cached, "fromCache": True}

    if not _api_key():
        return {
            "series": [],
            "latest": None,
            "source": "Santiment",
            "error": "Set SANTIMENT_API_KEY in .env.local",
            "fetchedAt": _now_iso(),
        }

    to_dt = datetime.now(timezone.utc)
    # Free plan has ~1y historical window; wider ranges return GraphQL subscription errors.
    from_dt = to_dt - timedelta(days=365)
    query = """
    query SantimentSeries($metric: String!, $slug: String!, $from: DateTime!, $to: DateTime!) {
      getMetric(metric: $metric) {
        timeseriesData(slug: $slug, from: $from, to: $to, interval: "1d") {
          datetime
          value
        }
      }
    }
    """
    variables = {
        "metric": metric,
        "slug": SLUG,
        "from": from_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "to": to_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    try:
        raw = _graphql(query, variables)
        if raw.get("errors"):
            msg = "; ".join(str(e.get("message", e)) for e in raw["errors"])
            stale = cache_get(cache_key, ttl=SANTIMENT_TTL * 7)
            if stale:
                return {**stale, "stale": True, "error": msg}
            return {"series": [], "latest": None, "source": "Santiment", "error": msg, "fetchedAt": _now_iso()}

        rows = (
            (raw.get("data") or {})
            .get("getMetric", {})
            .get("timeseriesData")
            or []
        )
        series: list[dict] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            val = row.get("value")
            if val is None:
                continue
            dt_str = str(row.get("datetime") or "")[:10]
            try:
                ts = int(datetime.strptime(dt_str, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
            except ValueError:
                ts = None
            series.append({"timestamp": ts, "date": dt_str, "value": float(val)})
        series.sort(key=lambda p: p.get("timestamp") or 0)
        payload = {
            "series": series,
            "latest": series[-1] if series else None,
            "source": "Santiment",
            "fetchedAt": _now_iso(),
            "note": "Free plan — restricted metrics may have 30d lag or 1y cap",
        }
        cache_set(cache_key, payload)
        return payload
    except urllib.error.HTTPError as exc:
        msg = exc.read().decode("utf-8", errors="replace")[:200]
        if exc.code == 403 and "1010" in msg:
            msg = "Santiment blocked request (Cloudflare 1010) — restart server after updating santiment.py"
        stale = cache_get(cache_key, ttl=SANTIMENT_TTL * 7)
        if stale:
            return {**stale, "stale": True, "error": msg}
        return {"series": [], "latest": None, "source": "Santiment", "error": msg, "fetchedAt": _now_iso()}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, TypeError) as exc:
        stale = cache_get(cache_key, ttl=SANTIMENT_TTL * 7)
        if stale:
            return {**stale, "stale": True, "error": str(exc)}
        return {"series": [], "latest": None, "source": "Santiment", "error": str(exc), "fetchedAt": _now_iso()}