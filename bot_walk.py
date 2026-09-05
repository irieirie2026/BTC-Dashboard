#!/usr/bin/env python3
"""Walk the live dashboard the way a Grok bot should: open pages, hit APIs, report errors.

  python3 bot_walk.py --base https://btc-dashboard-bay.vercel.app --out walk-report.json

Bots can instead GET /api/desk-walk (critical probes + page list + error signatures).
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

USER_AGENT = "btc-dashboard-bot-walk/1.0"
DEFAULT_BASE = "https://btc-dashboard-bay.vercel.app"

# Deep links a bot should open (SPA). Wait ≤15s. Then look for ERROR_SIGNATURES.
PAGES: list[dict[str, str]] = [
    {"id": "home", "gui": "Home", "path": "/"},
    {"id": "market_spot", "gui": "Market → Spot", "path": "/market/spot"},
    {"id": "derivatives_perp", "gui": "Derivatives → Perp", "path": "/derivatives/perp"},
    {"id": "derivatives_futures", "gui": "Derivatives → Futures", "path": "/derivatives/futures"},
    {"id": "derivatives_options", "gui": "Derivatives → Options", "path": "/derivatives/options"},
    {"id": "onchain_mining", "gui": "On Chain → Mining", "path": "/onchain/mining"},
    {"id": "etf", "gui": "ETFs", "path": "/etf/holdings"},
    {"id": "treasury", "gui": "DATCO", "path": "/treasury/summary"},
    {"id": "stats_vol", "gui": "Stats → Volatility", "path": "/stats/volatility"},
    {"id": "stats_ts", "gui": "Stats → Time Series", "path": "/stats/timeseries"},
    {"id": "stats_val", "gui": "Stats → Valuation (Markov/PL)", "path": "/stats/valuation"},
    {"id": "defi_lending", "gui": "DeFi → Lending", "path": "/defi/lending"},
    {"id": "macro_drivers", "gui": "Macro → Drivers / Liquidity", "path": "/macro/drivers"},
    {"id": "macro_liq", "gui": "Macro → Liquidity (Yahoo)", "path": "/macro/liquidity"},
    {"id": "news", "gui": "News", "path": "/news/all"},
    {"id": "law", "gui": "The Law", "path": "/law"},
    {"id": "valuation", "gui": "Valuation", "path": "/valuation/overview"},
]

ERROR_SIGNATURES = [
    "UNAVAILABLE · BINANCE",
    "LOADING… · BINANCE",
    "LOADING... · BINANCE",
    "LOADING… · DEFI LLAMA",
    "LOADING... · DEFI LLAMA",
    "INVALID LIQUIDITY PAYLOAD",
    "NO HISTORY",
    "FAILED TO FETCH",
    "Just a moment",
]

BOT_INSTRUCTIONS = (
    "Navigate production (not Vercel preview SSO). Open each page in `pages`, wait 12 seconds. "
    "Report an error if: still Loading…; UNAVAILABLE · BINANCE (no OKX/Hyperliquid fallback); "
    "max pain or strikes still $—; unlabeled ATM IV; miner revenue > 2000 BTC/day; "
    "INVALID LIQUIDITY PAYLOAD with no stale series. "
    "Also GET /api/desk-walk and include its `errors` array. "
    "Do not invent numbers. Null/missing = unknown."
)

# API probes. `need` = dotted paths that must be present and non-empty.
API_CHECKS: list[dict[str, Any]] = [
    {
        "id": "perp",
        "gui": "Derivatives → Perp",
        "path": "/api/market/perp",
        "need": ["lastPrice", "markPrice", "venue"],
        "critical": True,
    },
    {
        "id": "futures",
        "gui": "Derivatives → Futures",
        "path": "/api/market/futures",
        "need": ["venue"],
        "critical": True,
    },
    {
        "id": "options",
        "gui": "Derivatives → Options",
        "path": "/api/options",
        "need": ["contracts", "dvol"],
        "critical": True,
    },
    {
        "id": "etf",
        "gui": "ETFs",
        "path": "/api/etf",
        "need": [],
        "critical": False,
    },
    {
        "id": "treasury",
        "gui": "DATCO",
        "path": "/api/treasury",
        "need": [],
        "critical": False,
    },
    {
        "id": "news",
        "gui": "News",
        "path": "/api/news/all",
        "need": ["articles"],
        "critical": False,
    },
    {
        "id": "law",
        "gui": "The Law",
        "path": "/api/law",
        "need": ["jurisdictions"],
        "critical": False,
    },
    {
        "id": "defi_lending",
        "gui": "DeFi → Lending",
        "path": "/api/defi/lending",
        "need": [],
        "critical": False,
    },
    {
        "id": "macro_rates",
        "gui": "Macro → Rates",
        "path": "/api/macro/rates",
        "need": [],
        "critical": False,
    },
    {
        "id": "btc_snapshot",
        "gui": "Valuation / On Chain snapshot",
        "path": "/api/misc/btc/snapshot",
        "need": [],
        "critical": False,
    },
    {
        "id": "vol_catalog",
        "gui": "Stats → Volatility catalog",
        "path": "/api/stats/volatility/catalog",
        "need": ["catalog"],
        "critical": False,
    },
    {
        "id": "miners_revenue",
        "gui": "On Chain → Mining revenue series",
        "path": "/api/onchain/chart?name=miners-revenue&timespan=30days",
        "need": ["values"],
        "critical": True,
    },
    {
        "id": "spot",
        "gui": "Market → Spot",
        "path": "/api/market/quote",
        "need": [],
        "critical": False,
    },
    {
        "id": "exchanges",
        "gui": "Exchanges",
        "path": "/api/exchanges/overview",
        "need": [],
        "critical": False,
    },
]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _get(url: str, timeout: float) -> tuple[int | None, Any, str | None]:
    req = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "application/json,text/html,*/*"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read(2_000_000)
            status = getattr(resp, "status", 200) or 200
            text = raw.decode("utf-8", errors="replace")
            if text[:1] in "{[":
                try:
                    return status, json.loads(text), None
                except json.JSONDecodeError:
                    return status, text, None
            return status, text, None
    except urllib.error.HTTPError as exc:
        body = None
        try:
            body = exc.read().decode("utf-8", errors="replace")[:400]
        except Exception:
            body = None
        return exc.code, body, f"HTTP {exc.code}"
    except Exception as exc:
        return None, None, str(exc)[:240]


def _dig(obj: Any, key: str) -> Any:
    cur = obj
    for part in key.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def _has_need(payload: Any, need: list[str]) -> str | None:
    if not need:
        return None
    if not isinstance(payload, dict):
        return "not an object"
    for key in need:
        val = _dig(payload, key)
        if val is None or val == "" or val == []:
            return f"missing {key}"
    return None


def check_page(base: str, page: dict[str, str], timeout: float) -> dict[str, Any]:
    url = base.rstrip("/") + page["path"]
    status, body, err = _get(url, timeout)
    row: dict[str, Any] = {
        "id": page["id"],
        "gui": page["gui"],
        "url": url,
        "kind": "page",
        "ok": False,
        "status": status,
        "error": err,
    }
    if err:
        return row
    text = body if isinstance(body, str) else json.dumps(body)
    if "vercel.com/login" in text or "SSO" in text[:500] and "vercel" in text.lower():
        row["error"] = "Vercel SSO login — bots cannot use preview; use production"
        return row
    if status and status >= 400:
        row["error"] = f"HTTP {status}"
        return row
    if "app.js" not in text and "BTC" not in text:
        row["error"] = "not the dashboard HTML"
        return row
    hits = [s for s in ERROR_SIGNATURES if s.lower() in text.lower()]
    # SPA HTML will not contain live Loading strings; only flag SSO/404.
    row["ok"] = True
    row["error"] = None
    row["note"] = "HTML shell ok (SPA data loads in JS). Open in a browser and wait 12s."
    if hits:
        row["ok"] = False
        row["error"] = "html contains " + ", ".join(hits)
    return row


def check_api(base: str, spec: dict[str, Any], timeout: float) -> dict[str, Any]:
    url = base.rstrip("/") + spec["path"]
    status, body, err = _get(url, timeout)
    row: dict[str, Any] = {
        "id": spec["id"],
        "gui": spec["gui"],
        "url": url,
        "kind": "api",
        "ok": False,
        "status": status,
        "error": err,
        "critical": bool(spec.get("critical")),
    }
    if err:
        return row
    if status and status >= 400:
        row["error"] = f"HTTP {status}"
        return row
    if isinstance(body, dict) and body.get("error") and spec["id"] != "treasury":
        # treasury is allowed to be partial; still flag
        if not any(body.get(k) for k in ("contracts", "cells", "articles", "heroes", "lastPrice")):
            row["error"] = str(body.get("error"))[:200]
            return row
    miss = _has_need(body, spec.get("need") or [])
    if miss:
        row["error"] = miss
        return row
    extra = {}
    if spec["id"] == "perp" and isinstance(body, dict):
        extra = {
            "venue": body.get("venue"),
            "lastPrice": body.get("lastPrice"),
            "fallback": body.get("fallback"),
        }
        if str(body.get("venue") or "").upper() == "BINANCE" and body.get("error"):
            row["error"] = "Binance failed with no fallback venue"
            row["extra"] = extra
            return row
    if spec["id"] == "miners_revenue" and isinstance(body, dict):
        vals = body.get("values") or []
        last = vals[-1].get("y") if vals and isinstance(vals[-1], dict) else None
        extra["last_raw"] = last
        if isinstance(last, (int, float)) and last > 2_000:
            extra["note"] = "raw looks like USD; UI must convert, never print as BTC/day"
    if spec["id"] == "options" and isinstance(body, dict):
        extra = {
            "n_contracts": len(body.get("contracts") or []),
            "dvol": body.get("dvol"),
        }
    if spec["id"] == "futures" and isinstance(body, dict):
        extra = {
            "venue": body.get("venue"),
            "n_contracts": len(body.get("contracts") or []),
            "perp_last": (body.get("perp") or {}).get("lastPrice") or body.get("lastPrice"),
        }
        if extra["perp_last"] is None and extra["n_contracts"] == 0:
            row["error"] = "no perp last and no dated contracts"
            row["extra"] = extra
            return row
    row["ok"] = True
    row["error"] = None
    if extra:
        row["extra"] = extra
    return row


def run_walk(
    *,
    base: str = DEFAULT_BASE,
    timeout: float = 12.0,
    pages: bool = True,
    critical_only: bool = False,
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    if pages:
        for page in PAGES:
            results.append(check_page(base, page, min(timeout, 8.0)))
    checks = [c for c in API_CHECKS if c.get("critical")] if critical_only else API_CHECKS
    for spec in checks:
        results.append(check_api(base, spec, timeout))
    errors = [r for r in results if not r.get("ok")]
    return {
        "as_of": now_iso(),
        "base": base,
        "bot_instructions": BOT_INSTRUCTIONS,
        "error_signatures": ERROR_SIGNATURES,
        "pages": [{"gui": p["gui"], "url": base.rstrip("/") + p["path"]} for p in PAGES],
        "ok_count": sum(1 for r in results if r.get("ok")),
        "fail_count": len(errors),
        "results": results,
        "errors": errors,
        "status": "ok" if not errors else "fail",
    }


def render_md(report: dict[str, Any]) -> str:
    lines = [
        "# Dashboard bot walk",
        "",
        f"- as_of: {report.get('as_of')}",
        f"- base: {report.get('base')}",
        f"- status: {report.get('status')}  {report.get('ok_count')} ok / {report.get('fail_count')} errors",
        "",
        report.get("bot_instructions") or "",
        "",
        "## Errors",
        "",
    ]
    errs = report.get("errors") or []
    if not errs:
        lines.append("(none)")
    for e in errs:
        lines.append(
            f"- **{e.get('gui')}** `{e.get('url')}` — {e.get('error')}"
        )
    lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Walk live dashboard APIs/pages and report errors")
    p.add_argument("--base", default=DEFAULT_BASE)
    p.add_argument("--timeout", type=float, default=12.0)
    p.add_argument("--out", default="")
    p.add_argument("--critical-only", action="store_true")
    p.add_argument("--no-pages", action="store_true")
    args = p.parse_args(argv)
    report = run_walk(
        base=args.base,
        timeout=args.timeout,
        pages=not args.no_pages,
        critical_only=args.critical_only,
    )
    text = json.dumps(report, indent=2) + "\n"
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)
        md = args.out.rsplit(".", 1)[0] + ".md"
        with open(md, "w", encoding="utf-8") as fh:
            fh.write(render_md(report))
    print(render_md(report))
    return 0 if report.get("status") == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
