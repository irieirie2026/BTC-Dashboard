"""
Super Summary — hybrid fact pack + optional xAI prose for the whole dashboard.

Numbers and phases are computed in code. The LLM only narrates the fact pack.
Uses the same project env as the rest of the app (server.py loads .env.local).
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Ensure .env.local is loaded even if this module is imported without server first
# (e.g. cold Vercel worker path order). Same keys as knowledge graph / rest of app.
def _ensure_project_env() -> None:
    try:
        # Prefer the shared loader (ROOT-relative .env.local / .env)
        from server import _load_dotenv_files  # noqa: WPS433

        _load_dotenv_files()
        return
    except Exception:
        pass
    root = Path(__file__).resolve().parent
    for name in (".env.local", ".env"):
        path = root / name
        if not path.is_file():
            continue
        try:
            for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key = key.strip()
                if not key:
                    continue
                val = val.strip()
                if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                    val = val[1:-1]
                os.environ.setdefault(key, val)
        except OSError:
            continue


_ensure_project_env()

# Mid-tier list rates (USD per 1M tokens) for cost display
COST_IN_PER_M = float(os.environ.get("SS_COST_IN_PER_M", "2.5"))
COST_OUT_PER_M = float(os.environ.get("SS_COST_OUT_PER_M", "10.0"))
CACHE_TTL = int(os.environ.get("SS_CACHE_TTL", "7200"))  # 2h
CACHE_TTL_RULES = int(os.environ.get("SS_CACHE_TTL_RULES", "600"))  # short when LLM not used
USER_AGENT = "BTC-Dashboard-SuperSummary/1.0"
# Prefer a real xAI completion whenever the key is present.
# (Earlier we skipped/starved the LLM when domain fetch was slow — that produced rules prose
# even though the account still had quota.)
LLM_TIMEOUT = int(os.environ.get("SS_LLM_TIMEOUT", "70"))
LLM_MAX_TOKENS = int(os.environ.get("SS_LLM_MAX_TOKENS", "2400"))


def _default_model() -> str:
    _ensure_project_env()
    return (
        (os.environ.get("SS_LLM_MODEL") or "").strip()
        or (os.environ.get("KG_LLM_MODEL") or "").strip()
        or "grok-3-mini"
    )


# Back-compat for any import of DEFAULT_MODEL
DEFAULT_MODEL = _default_model()


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _llm_api_key() -> str | None:
    _ensure_project_env()
    key = (os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY") or "").strip()
    return key or None


def _safe(label: str, fn, *args, **kwargs) -> dict[str, Any]:
    try:
        result = fn(*args, **kwargs)
        if isinstance(result, dict):
            return {"ok": True, "label": label, "data": result}
        return {"ok": True, "label": label, "data": {"value": result}}
    except Exception as exc:
        return {"ok": False, "label": label, "error": str(exc)[:240]}


def _cell_summary(cells: dict[str, Any], keys: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k in keys:
        c = cells.get(k) or {}
        if not isinstance(c, dict):
            continue
        entry: dict[str, Any] = {}
        if c.get("value") is not None:
            entry["value"] = c.get("value")
        if c.get("dataAsOf"):
            entry["dataAsOf"] = c.get("dataAsOf")
        if c.get("fetchedAt"):
            entry["fetchedAt"] = c.get("fetchedAt")
        if c.get("stale"):
            entry["stale"] = True
        if c.get("source"):
            entry["source"] = c.get("source")
        if entry:
            out[k] = entry
    return out


def _cycle_facts_from_history(days: list[dict]) -> dict[str, Any]:
    """Lightweight C4-oriented cycle facts from daily close history."""
    if not days:
        return {"available": False}
    closes = []
    for d in days:
        try:
            t = d.get("date")
            c = float(d.get("close"))
            if t is None or not (c > 0):
                continue
            if isinstance(t, (int, float)):
                ts = int(t)
                if ts > 1e12:
                    ts //= 1000
                date = time.strftime("%Y-%m-%d", time.gmtime(ts))
            else:
                date = str(t)[:10]
            closes.append({"date": date, "close": c, "t": ts if isinstance(t, (int, float)) else None})
        except (TypeError, ValueError):
            continue
    if len(closes) < 30:
        return {"available": False, "points": len(closes)}

    last = closes[-1]
    # Halving anchors (same as valuation-cycle.js)
    halvings = ["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-20"]
    h4 = "2024-04-20"

    def nearest(date_str: str):
        for p in closes:
            if p["date"] >= date_str:
                return p
        return closes[-1]

    def max_since(start_date: str):
        best = None
        for p in closes:
            if p["date"] < start_date:
                continue
            if best is None or p["close"] > best["close"]:
                best = p
        return best

    def days_between(a: str, b: str) -> int:
        da = datetime.strptime(a[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        db = datetime.strptime(b[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return int((db - da).total_seconds() // 86400)

    h_bar = nearest(h4)
    peak = max_since(h4) or last
    dd = (peak["close"] - last["close"]) / peak["close"] * 100 if peak["close"] else 0
    days_since_h = days_between(h4, last["date"])
    days_since_peak = days_between(peak["date"], last["date"])
    avg_p2b = 383
    p2b_pct = min(100, round(100 * days_since_peak / avg_p2b)) if avg_p2b else 0

    phase = "Markdown"
    if dd < 12 and days_since_peak < 45:
        phase = "Late distribution / early markdown"
    elif dd >= 55 and p2b_pct >= 90:
        phase = "Late markdown / accumulation watch"
    elif dd < 5:
        phase = "Near cycle high"

    return {
        "available": True,
        "asOf": last["date"],
        "spot": last["close"],
        "lastHalving": h4,
        "halvingPrice": h_bar["close"],
        "cycleAthDate": peak["date"],
        "cycleAthPrice": peak["close"],
        "drawdownFromAthPct": round(-dd, 1),
        "daysSinceHalving": days_since_h,
        "daysSincePeak": days_since_peak,
        "avgPeakToBottomDays": avg_p2b,
        "peakToBottomProgressPct": p2b_pct,
        "phase": phase,
        "halvingAnchors": halvings,
        "nextHalvingEst": "2028-04-20",
    }


def _fetch_domain_raw(name: str, refresh: bool) -> dict[str, Any]:
    """Fetch one domain payload (runs in a worker thread)."""
    if name == "btc_snapshot":
        return _safe(
            name,
            lambda: __import__(
                "btc_indicators_api", fromlist=["get_snapshot_payload"]
            ).get_snapshot_payload(refresh=refresh),
        )
    if name == "btc_history":
        return _safe(
            name,
            lambda: __import__(
                "server", fromlist=["get_stats_btc_history_payload"]
            ).get_stats_btc_history_payload(refresh=refresh),
        )
    if name == "fear_greed":
        return _safe(
            name,
            lambda: __import__(
                "server", fromlist=["get_fear_greed_payload"]
            ).get_fear_greed_payload(refresh=refresh),
        )
    if name == "etf":
        return _safe(
            name,
            lambda: __import__("server", fromlist=["get_etf_payload"]).get_etf_payload(
                refresh=refresh
            ),
        )
    if name == "treasury":
        return _safe(
            name,
            lambda: __import__(
                "server", fromlist=["get_treasury_payload"]
            ).get_treasury_payload(refresh=refresh),
        )
    if name == "news":
        return _safe(
            name,
            lambda: __import__("server", fromlist=["get_news_payload"]).get_news_payload(
                "all", refresh=refresh
            ),
        )
    if name == "macro":
        from server import get_macro_payload

        return _safe(name, lambda: get_macro_payload("risk", refresh=refresh))
    if name == "exchanges":
        from server import get_exchanges_payload

        return _safe(name, lambda: get_exchanges_payload("spot", refresh=refresh))
    return {"ok": False, "label": name, "error": "unknown domain"}


def build_fact_pack(*, refresh: bool = False) -> dict[str, Any]:
    """Assemble multi-domain facts from existing dashboard payloads (domains in parallel)."""
    sources: list[str] = []
    stale_flags: list[str] = []
    errors: list[str] = []
    domains: dict[str, Any] = {}

    domain_names = [
        "btc_snapshot",
        "btc_history",
        "fear_greed",
        "etf",
        "treasury",
        "news",
        "macro",
        "exchanges",
    ]
    raw: dict[str, dict[str, Any]] = {}
    # Parallel fetch — sequential cold refresh was often 60–120s alone
    with ThreadPoolExecutor(max_workers=min(8, len(domain_names))) as pool:
        futs = {
            pool.submit(_fetch_domain_raw, name, refresh): name for name in domain_names
        }
        for fut in as_completed(futs):
            name = futs[fut]
            try:
                raw[name] = fut.result()
            except Exception as exc:
                raw[name] = {"ok": False, "label": name, "error": str(exc)[:240]}

    snap = raw.get("btc_snapshot") or {"ok": False, "error": "missing"}
    if snap.get("ok"):
        data = snap["data"]
        cells = data.get("cells") or {}
        keys = [
            "mvrv", "mvrv_z_score", "nupl", "realized_price", "puell_multiple",
            "sopr", "supply_in_profit", "fear_greed", "funding_rate", "open_interest",
            "btc_dominance", "exchange_netflow", "active_addresses", "hash_rate",
        ]
        domains["valuation"] = {
            "cells": _cell_summary(cells, keys),
            "staleCount": data.get("staleCount"),
            "sourceChain": data.get("sourceChain"),
        }
        sources.append("btc_indicators_snapshot")
        for k, c in (domains["valuation"]["cells"] or {}).items():
            if c.get("stale"):
                stale_flags.append(f"valuation.{k}")
    else:
        errors.append(f"btc_snapshot: {snap.get('error')}")

    hist = raw.get("btc_history") or {"ok": False, "error": "missing"}
    if hist.get("ok"):
        days = hist["data"].get("days") or []
        domains["price"] = {
            "pair": hist["data"].get("pair"),
            "source": hist["data"].get("source"),
            "count": hist["data"].get("count") or len(days),
            "endDate": hist["data"].get("endDate"),
            "stale": hist["data"].get("stale"),
        }
        domains["cycle"] = _cycle_facts_from_history(days)
        sources.append("stats_btc_history")
        if hist["data"].get("stale"):
            stale_flags.append("price.history")
    else:
        errors.append(f"btc_history: {hist.get('error')}")

    fng = raw.get("fear_greed") or {"ok": False, "error": "missing"}
    if fng.get("ok"):
        d = fng["data"]
        latest = d.get("latest") or {}
        domains["sentiment"] = {
            "fearGreed": latest.get("value"),
            "classification": latest.get("classification"),
            "fetchedAt": d.get("fetchedAt"),
        }
        sources.append("fear_greed")
    else:
        errors.append(f"fear_greed: {fng.get('error')}")

    etf = raw.get("etf") or {"ok": False, "error": "missing"}
    if etf.get("ok"):
        d = etf["data"]
        holdings = d.get("holdings") or {}
        flows = d.get("flows") or {}
        domains["etf"] = {
            "totalBtc": holdings.get("totalBtc") or holdings.get("total_btc"),
            "totalAum": holdings.get("totalAum") or holdings.get("total_aum"),
            "latestNetFlow": flows.get("latestNetFlow") or flows.get("latest"),
            "fetchedAt": d.get("fetchedAt"),
        }
        sources.append("etf")
    else:
        errors.append(f"etf: {etf.get('error')}")

    trs = raw.get("treasury") or {"ok": False, "error": "missing"}
    if trs.get("ok"):
        d = trs["data"]
        summary = d.get("summary") or d.get("stats") or d
        domains["treasury"] = {
            "totalBtc": summary.get("totalBtc") or summary.get("total_btc"),
            "companyCount": summary.get("companyCount") or summary.get("count"),
            "fetchedAt": d.get("fetchedAt"),
        }
        sources.append("treasury")
    else:
        errors.append(f"treasury: {trs.get('error')}")

    news = raw.get("news") or {"ok": False, "error": "missing"}
    if news.get("ok"):
        items = news["data"].get("items") or news["data"].get("articles") or []
        headlines = []
        for it in items[:8]:
            if not isinstance(it, dict):
                continue
            t = (it.get("title") or "").strip()
            if t:
                headlines.append(
                    {
                        "title": t[:180],
                        "source": it.get("source") or it.get("publisher"),
                        "sentiment": it.get("sentiment"),
                    }
                )
        domains["news"] = {"headlines": headlines}
        sources.append("news")
    else:
        errors.append(f"news: {news.get('error')}")

    md = raw.get("macro") or {"ok": False, "error": "missing"}
    if md.get("ok"):
        d = md["data"] if isinstance(md.get("data"), dict) else {}
        thin: dict[str, Any] = {"fetchedAt": d.get("fetchedAt")}
        for k in (
            "dxy", "us10y", "vix", "m2", "fedFunds", "liquidity",
            "riskScore", "headline", "summary", "regime",
        ):
            if d.get(k) is not None:
                val = d.get(k)
                if isinstance(val, str):
                    thin[k] = val[:400]
                else:
                    thin[k] = val
        heroes = d.get("heroes") or d.get("kpis") or []
        if isinstance(heroes, list) and heroes:
            thin["heroes"] = [
                {
                    "name": h.get("name") or h.get("label"),
                    "value": h.get("value"),
                    "sub": h.get("sub"),
                }
                for h in heroes[:6]
                if isinstance(h, dict)
            ]
        domains["macro"] = thin
        sources.append("macro")
    else:
        errors.append(f"macro: {md.get('error')}")

    ex = raw.get("exchanges") or {"ok": False, "error": "missing"}
    if ex.get("ok"):
        table = ex["data"].get("table") or ex["data"].get("venues") or []
        binance = next(
            (
                r
                for r in table
                if isinstance(r, dict)
                and "binance" in str(r.get("exchange") or r.get("name") or "").lower()
            ),
            table[0] if table else None,
        )
        if isinstance(binance, dict):
            domains["spot"] = {
                "exchange": binance.get("exchange") or binance.get("name"),
                "price": binance.get("price") or binance.get("last"),
                "change24hPct": binance.get("change24h")
                or binance.get("changePct")
                or binance.get("pct"),
            }
            sources.append("exchanges_spot")
    else:
        errors.append(f"spot: {ex.get('error')}")

    coverage_domains = ["valuation", "cycle", "price", "sentiment", "etf", "treasury", "news", "macro", "spot"]
    present = sum(1 for k in coverage_domains if k in domains and domains[k])
    coverage_pct = round(100 * present / len(coverage_domains))

    pack = {
        "asOf": _now_iso(),
        "coveragePct": coverage_pct,
        "sources": sources,
        "staleFlags": stale_flags,
        "errors": errors[:12],
        "domains": domains,
    }
    pack["hash"] = hashlib.sha256(
        json.dumps(pack, sort_keys=True, default=str).encode()
    ).hexdigest()[:16]
    return pack


def _num(v: Any) -> float | None:
    try:
        if v is None:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _fmt_usd(v: Any) -> str:
    n = _num(v)
    if n is None:
        return "—"
    if abs(n) >= 1e9:
        return f"${n / 1e9:.2f}B"
    if abs(n) >= 1e6:
        return f"${n / 1e6:.2f}M"
    return f"${n:,.0f}"


def _fmt_btc(v: Any) -> str:
    n = _num(v)
    if n is None:
        return "—"
    if abs(n) >= 1e6:
        return f"{n / 1e6:.2f}M BTC"
    if abs(n) >= 1e3:
        return f"{n:,.0f} BTC"
    return f"{n:.2f} BTC"


def _cell_val(cells: dict[str, Any], key: str) -> Any:
    c = cells.get(key) or {}
    return c.get("value") if isinstance(c, dict) else None


def _valuation_read(cells: dict[str, Any]) -> list[str]:
    """Short interpretive lines for key on-chain prints (rules narrative)."""
    out: list[str] = []
    mvrv_z = _num(_cell_val(cells, "mvrv_z_score"))
    nupl = _num(_cell_val(cells, "nupl"))
    mvrv = _num(_cell_val(cells, "mvrv"))
    puell = _num(_cell_val(cells, "puell_multiple"))
    funding = _num(_cell_val(cells, "funding_rate"))
    sopr = _num(_cell_val(cells, "sopr"))

    if mvrv_z is not None:
        if mvrv_z >= 7:
            band = "historically extreme euphoria territory"
        elif mvrv_z >= 3.5:
            band = "elevated / late-cycle rich"
        elif mvrv_z >= 1:
            band = "above fair-value band (expansion)"
        elif mvrv_z >= 0:
            band = "near realized-value equilibrium"
        elif mvrv_z >= -0.5:
            band = "mildly discounted vs realized"
        else:
            band = "deep discount / stress zone historically associated with late bear / early accumulation"
        out.append(f"**MVRV Z-Score {mvrv_z:.2f}** — {band}.")

    if nupl is not None:
        if nupl >= 0.75:
            zone = "euphoria (most supply in large unrealized profit)"
        elif nupl >= 0.5:
            zone = "belief / late bull (strong aggregate profit)"
        elif nupl >= 0.25:
            zone = "optimism / mid-cycle"
        elif nupl >= 0:
            zone = "hope / early recovery (thin aggregate profit)"
        else:
            zone = "capitulation / net unrealized loss across the network"
        out.append(f"**NUPL {nupl:.3f}** — {zone}.")

    if mvrv is not None:
        out.append(
            f"**MVRV {mvrv:.2f}×** — market cap is {mvrv:.2f}× realized cap "
            f"({'premium to holder cost basis' if mvrv >= 1 else 'discount to holder cost basis'})."
        )
    if puell is not None:
        tone = (
            "miner revenue stress (historically supportive for longer-term bottoms when sustained)"
            if puell < 0.5
            else "elevated miner revenue (often seen late in expansions)"
            if puell > 1.5
            else "mid-range miner revenue"
        )
        out.append(f"**Puell Multiple {puell:.2f}** — {tone}.")
    if sopr is not None:
        out.append(
            f"**SOPR {sopr:.3f}** — coins moved today are settling "
            f"{'above' if sopr >= 1 else 'below'} aggregate cost basis "
            f"({'profit-taking pressure' if sopr > 1.02 else 'loss realization / weak demand' if sopr < 0.98 else 'near breakeven flows'})."
        )
    if funding is not None:
        out.append(
            f"**Perp funding {funding:.4f}** — "
            f"{'longs paying shorts (crowded long)' if funding > 0.0001 else 'shorts paying longs (crowded short / fear)' if funding < -0.0001 else 'near-neutral leverage tilt'}."
        )
    return out


def _cycle_posture(cycle: dict[str, Any]) -> str:
    phase = str(cycle.get("phase") or "unknown")
    dd = _num(cycle.get("drawdownFromAthPct"))
    days_peak = _num(cycle.get("daysSincePeak"))
    prog = _num(cycle.get("peakToBottomProgressPct"))
    bits = [f"Desk labels the path **{phase}**."]
    if dd is not None:
        bits.append(f"Spot sits about **{abs(dd):.1f}%** below the cycle ATH print in the fact pack.")
    if days_peak is not None:
        bits.append(f"**{days_peak:.0f} days** have elapsed since that peak.")
    if prog is not None:
        bits.append(
            f"That is roughly **{prog:.0f}%** of the ~{cycle.get('avgPeakToBottomDays') or 'n/a'}-day "
            "average peak→bottom window from prior cycles (n≈3 — fragile template)."
        )
    return " ".join(bits)


def _rules_only_markdown(pack: dict[str, Any]) -> str:
    """
    Desk-style multi-paragraph brief when xAI is unavailable or times out.
    Structured like Valuation tab outlook panels — not a raw metric dump.
    """
    d = pack.get("domains") or {}
    cycle = d.get("cycle") or {}
    val_cells = (d.get("valuation") or {}).get("cells") or {}
    sent = d.get("sentiment") or {}
    etf = d.get("etf") or {}
    trs = d.get("treasury") or {}
    news = d.get("news") or {}
    macro = d.get("macro") or {}
    spot = d.get("spot") or {}
    as_of = pack.get("asOf") or "—"
    cov = pack.get("coveragePct")

    # —— Executive brief ——
    exec_bits: list[str] = [
        f"As of **{as_of}**, this Final Report synthesizes **{cov}%** of dashboard domains "
        f"({', '.join(pack.get('sources') or []) or 'limited sources'})."
    ]
    if cycle.get("available"):
        exec_bits.append(_cycle_posture(cycle))
    spot_px = spot.get("price") or cycle.get("spot")
    if spot_px is not None:
        ch = spot.get("change24hPct")
        ch_s = f" ({float(ch):+.2f}% 24h)" if _num(ch) is not None else ""
        exec_bits.append(f"Reference spot is about **{_fmt_usd(spot_px)}**{ch_s}.")
    fg = sent.get("fearGreed")
    if fg is None:
        fg = _cell_val(val_cells, "fear_greed")
    if fg is not None:
        cls = sent.get("classification")
        cls_s = f" ({cls})" if cls else ""
        exec_bits.append(
            f"Crowd sentiment prints **Fear & Greed {fg}**{cls_s} — "
            "use as a contrarian / regime overlay, not a standalone trigger."
        )
    val_reads = _valuation_read(val_cells)
    if val_reads:
        exec_bits.append(
            "On-chain valuation is **not** in a vacuum: cross-check MVRV/NUPL against ETF flows and leverage before sizing risk."
        )

    lines: list[str] = [
        "## Executive brief",
        " ".join(exec_bits),
        "",
        "This is a **client-report** style brief: situation assessment, evidence from the fact pack, "
        "and multi-week posture — not a trade ticket. Supporting charts and tables in the UI are built "
        "from the same numbers cited below.",
    ]

    # —— Cycle ——
    if cycle.get("available"):
        spot_c = cycle.get("spot")
        ath = cycle.get("cycleAthPrice")
        lines += [
            "",
            "## Cycle position",
            _cycle_posture(cycle),
            "",
            f"- Spot (pack): **{_fmt_usd(spot_c)}** · Cycle ATH: **{_fmt_usd(ath)}** · "
            f"Drawdown: **{cycle.get('drawdownFromAthPct')}%**",
            f"- Days since halvings: **{cycle.get('daysSinceHalving')}** · "
            f"Days since peak: **{cycle.get('daysSincePeak')}** · "
            f"Peak→bottom progress: **{cycle.get('peakToBottomProgressPct')}%** "
            f"of ~**{cycle.get('avgPeakToBottomDays')}d** historical average",
            "",
            "Practical use: treat the phase label as **regime context** for multi-week risk, "
            "not a clock for the next session. Prior cycles differ in ETF era, stablecoin float, and rates — "
            "day-count templates break when liquidity regime changes.",
        ]
    else:
        lines += [
            "",
            "## Cycle position",
            "Cycle metrics were **not available** in this fact pack (price history missing or incomplete). "
            "Open **Valuation → 4y Cycle** after a successful history load, then regenerate.",
        ]

    # —— Valuation ——
    lines += ["", "## Valuation & market structure"]
    if val_reads:
        for r in val_reads:
            lines.append(f"- {r}")
        lines += [
            "",
            "Combined posture: when MVRV-Z and NUPL are **elevated together**, the desk leans defensive on new leverage "
            "and prefers confirmation from distribution metrics (exchange netflow, LTH spend). "
            "When both are **depressed**, the historical playbook is patience and scale-in over multi-month horizons — "
            "still subject to macro and ETF flow shocks.",
        ]
    else:
        lines.append(
            "Valuation cells were thin in this pack. Regenerate after the Bitcoin Indicators snapshot has loaded "
            "(Home does not require opening every tab, but cold stores can take one refresh)."
        )

    # —— Flows ——
    lines += ["", "## Flows & positioning (ETF / derivatives / treasury)"]
    flow_lines: list[str] = []
    if etf:
        flow_lines.append(
            f"US spot ETF complex (pack): total holdings about **{_fmt_btc(etf.get('totalBtc'))}**, "
            f"AUM **{_fmt_usd(etf.get('totalAum'))}**, latest net flow print **{etf.get('latestNetFlow')}**."
        )
        flow_lines.append(
            "ETF flow is the dominant post-2024 absorption channel: sustained outflows tighten the path of least resistance lower; "
            "persistent inflows can extend expansions even when on-chain looks rich."
        )
    if trs:
        flow_lines.append(
            f"Corporate / treasury tracker: **{_fmt_btc(trs.get('totalBtc'))}** across "
            f"**{trs.get('companyCount') or '—'}** names in the pack — slow-moving structural bid, not a day-trade signal."
        )
    funding = _cell_val(val_cells, "funding_rate")
    oi = _cell_val(val_cells, "open_interest")
    if funding is not None or oi is not None:
        flow_lines.append(
            f"Derivatives snapshot: funding **{funding if funding is not None else '—'}**, "
            f"open interest **{oi if oi is not None else '—'}**. "
            "Crowded positive funding + rich MVRV raises squeeze / flush risk; "
            "deeply negative funding into fear can mark forced short covering."
        )
    if not flow_lines:
        flow_lines.append("ETF / treasury / derivatives fields were sparse in this generation.")
    lines.extend(flow_lines)

    # —— Macro & news ——
    lines += ["", "## Macro & news"]
    if macro:
        heroes = macro.get("heroes") or []
        hero_bits = []
        for h in heroes[:4]:
            if isinstance(h, dict) and (h.get("name") or h.get("value") is not None):
                hero_bits.append(f"{h.get('name') or 'metric'}={h.get('value')}")
        if macro.get("headline") or macro.get("summary") or macro.get("regime"):
            lines.append(
                f"Macro pack: regime **{macro.get('regime') or 'n/a'}** — "
                f"{macro.get('headline') or macro.get('summary') or 'see heroes'}."
            )
        if hero_bits:
            lines.append("Key prints: " + "; ".join(hero_bits) + ".")
        lines.append(
            "BTC still trades as a high-beta liquidity asset: firmer real rates / stronger dollar typically headwind risk appetite; "
            "easing financial conditions and soft USD often support beta."
        )
    else:
        lines.append("Macro domain missing from this pack — regenerate after macro risk data is available.")

    hl = (news.get("headlines") or [])[:6]
    if hl:
        lines.append("Recent tape (titles only — not verified causal drivers):")
        for h in hl:
            src = h.get("source")
            title = h.get("title") or ""
            lines.append(f"- {title}" + (f" ({src})" if src else ""))

    # —— Outlook ——
    phase = str(cycle.get("phase") or "")
    bullish_lean = any(x in phase.lower() for x in ("accumulation", "early", "hope", "recovery"))
    bearish_lean = any(x in phase.lower() for x in ("markdown", "distribution", "euphoria", "late"))
    if bullish_lean:
        outlook = (
            "Base case framing (educational): as long as ETF absorption and liquidity do not break, "
            "deep-to-mid discount valuation historically favors multi-month constructive bias with high path volatility. "
            "Invalidation: breakdown to new cycle lows on rising exchange inventory and persistent ETF outflows."
        )
    elif bearish_lean:
        outlook = (
            "Base case framing (educational): late-cycle / distribution-style labels argue for smaller risk units, "
            "tighter invalidation, and respect for liquidity air-pockets. "
            "Invalidation: decisive ATH reclaim with healthy (not euphoric) on-chain and sustained ETF inflows."
        )
    else:
        outlook = (
            "Base case framing (educational): mixed cycle/valuation evidence favors **regime-aware** positioning — "
            "define risk off multi-week levels, avoid binary bets on day-count alone, and let ETF flows + MVRV trend arbitrate."
        )

    lines += [
        "",
        "## BTC price outlook",
        outlook,
        "",
        "Horizon: multi-week to multi-quarter. This is **not** a trade ticket for the next candle. "
        "Prefer evidence stacks (cycle phase + valuation band + ETF flow + funding) over any single KPI.",
        "",
        "## Risks / invalidation",
        "- Macro liquidity shock, sharp USD/real-yield spike, or risk-off equity vol can dominate crypto-native signals.",
        "- ETF outflow streaks can force inventory onto exchanges even when long-term holders stay inactive.",
        "- Crowded leverage (funding/OI) can produce violent squeezes that confuse trend readers.",
        "- Only three completed post-2012 halvings cycles exist — historical averages of duration and drawdown are fragile.",
        "",
        "## What to watch next",
        "- Daily/weekly **ETF net flows** and whether they confirm or contradict the cycle phase label.",
        "- **MVRV Z** and **NUPL** trend (rising into extremes vs rolling over from stress).",
        "- Exchange netflow / SOPR for distribution vs absorption.",
        "- Funding and open interest for crowded positioning before event risk.",
        "- Macro: DXY, real yields, and broad risk appetite if present in the macro pack.",
    ]
    if pack.get("staleFlags"):
        lines += [
            "",
            f"_Data quality note: stale flags — {', '.join(pack['staleFlags'][:16])}. Prefer regenerate after prefetch/store refresh._",
        ]
    lines += [
        "",
        "_Educational multi-domain desk brief (rules engine). Not financial advice._",
    ]
    return "\n".join(lines)


def _estimate_tokens(text: str) -> dict[str, int]:
    chars = len(text or "")
    out_tok = max(1, round(chars / 4))
    in_tok = round(out_tok * 2.5)
    return {
        "promptTokens": in_tok,
        "completionTokens": out_tok,
        "totalTokens": in_tok + out_tok,
    }


def _cost_usd(usage: dict[str, Any]) -> float:
    pin = float(usage.get("promptTokens") or 0)
    pout = float(usage.get("completionTokens") or 0)
    return (pin * COST_IN_PER_M + pout * COST_OUT_PER_M) / 1e6


def _confidence(pack: dict[str, Any], used_llm: bool) -> int:
    cov = int(pack.get("coveragePct") or 0)
    stale_n = len(pack.get("staleFlags") or [])
    conf = 25 + int(cov * 0.45)
    conf -= min(20, stale_n * 2)
    if used_llm:
        conf += 8
    if (pack.get("domains") or {}).get("cycle", {}).get("available"):
        conf += 5
    return max(15, min(82, conf))


def _call_xai(fact_pack: dict[str, Any], *, timeout: int | None = None) -> dict[str, Any] | None:
    """
    Call xAI for desk narrative. On timeout/error the caller falls back to rules prose.
    Always attempted when XAI_API_KEY is present — do not skip for domain-fetch budget.
    """
    key = _llm_api_key()
    if not key:
        return {"error": "XAI_API_KEY not set in environment (local: .env.local; Vercel: project env vars)"}
    base = os.environ.get("XAI_BASE_URL", "https://api.x.ai/v1").rstrip("/")
    # Slim pack for speed (full pack still used for KPIs client-side)
    pack_json = json.dumps(fact_pack, default=str)[:32000]
    timeout = int(timeout if timeout is not None else LLM_TIMEOUT)
    timeout = max(20, min(120, timeout))

    primary = _default_model()
    models: list[str] = []
    for m in (
        primary,
        (os.environ.get("SS_LLM_FALLBACK_MODEL") or "").strip(),
        "grok-3-mini",
        "grok-3",
    ):
        if m and m not in models:
            models.append(m)
    # At most two attempts so we do not cascade three full timeouts
    models = models[:2]

    system = (
        "You are a managing director–level Bitcoin strategist writing a CLIENT REPORT "
        "(institutional IC memo / board pack quality) for a professional multi-domain dashboard. "
        "Use ONLY numbers and facts inside the provided JSON fact pack — never invent prices, dates, %, or metrics. "
        "If a domain is missing, note the gap once and continue. "
        "Write for a sophisticated client who already understands crypto: no junior tutorials, no hype, no 'as an AI'. "
        "Every major claim must cite a concrete figure from the pack (e.g. MVRV Z, drawdown %, ETF holdings). "
        "Structure with these markdown headings exactly:\n"
        "## Executive brief\n"
        "## Cycle position\n"
        "## Valuation & market structure\n"
        "## Flows & positioning\n"
        "## Macro & news\n"
        "## BTC price outlook\n"
        "## Risks / invalidation\n"
        "## What to watch next\n"
        "Executive brief: 3–5 dense paragraphs — situation, evidence stack, posture, confidence. "
        "Each middle section: 2–4 paragraphs of analysis (not bullet dumps), then optional short bullets for key levels. "
        "Outlook: base / alternative / invalidation, horizon multi-week to multi-quarter, explicit confidence. "
        "Close with one line: educational research note, not investment advice. "
        "The UI will attach charts and tables under matching sections — write so numbers and charts reinforce each other."
    )
    user = (
        "Produce a client-report-level Final Report from this fact pack JSON. "
        "Prioritize decision-useful synthesis; quote pack numbers exactly.\n"
        f"<fact_pack>\n{pack_json}\n</fact_pack>"
    )
    # Longer client memos need more room
    # (LLM_MAX_TOKENS already env-overridable; ensure at least 1800)

    last_err = "xAI call failed"
    for i, model in enumerate(models):
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.25,
            "max_tokens": LLM_MAX_TOKENS,
        }
        req = urllib.request.Request(
            f"{base}/chat/completions",
            data=json.dumps(payload).encode(),
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode())
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
            text = text.strip()
            if not text:
                last_err = f"Empty completion from model {model}"
                # Do not burn another full timeout on empty — fall through to rules
                return {"error": last_err}
            usage_raw = data.get("usage") or {}
            usage = {
                "promptTokens": int(usage_raw.get("prompt_tokens") or usage_raw.get("input_tokens") or 0),
                "completionTokens": int(
                    usage_raw.get("completion_tokens") or usage_raw.get("output_tokens") or 0
                ),
                "totalTokens": int(usage_raw.get("total_tokens") or 0),
            }
            if not usage["totalTokens"]:
                usage["totalTokens"] = usage["promptTokens"] + usage["completionTokens"]
            return {"markdown": text, "usage": usage, "model": model}
        except urllib.error.HTTPError as exc:
            body = ""
            try:
                body = exc.read().decode("utf-8", errors="replace")[:500]
            except Exception:
                body = str(exc)
            # Billing / credits: do not try other models — same team limit
            low = body.lower()
            if exc.code in (402, 403) and any(
                s in low
                for s in (
                    "permission-denied",
                    "spending limit",
                    "available credits",
                    "purchase more credits",
                    "insufficient",
                )
            ):
                return {
                    "error": (
                        f"HTTP {exc.code} model={model}: xAI credits or monthly spending limit reached. "
                        "Add credits or raise the limit at https://console.x.ai — then regenerate. "
                        f"({body[:280]})"
                    )
                }
            last_err = f"HTTP {exc.code} model={model}: {body}"
            # Only try fallback model on "model not found" style errors
            if exc.code in (400, 404, 422) and i + 1 < len(models):
                continue
            return {"error": last_err}
        except TimeoutError:
            return {"error": f"xAI timed out after {timeout}s (model={model}) — using rules prose"}
        except (urllib.error.URLError, KeyError, json.JSONDecodeError, IndexError, OSError) as exc:
            # URLError often wraps socket.timeout
            msg = str(exc)[:240]
            if "timed out" in msg.lower() or "timeout" in msg.lower():
                return {"error": f"xAI timed out after {timeout}s — using rules prose"}
            last_err = f"{type(exc).__name__}: {msg}"
            return {"error": last_err}
    return {"error": last_err}


def _cache_get(key: str) -> dict[str, Any] | None:
    try:
        from macro_data.cache import cache_get

        return cache_get(key, ttl=CACHE_TTL)
    except Exception:
        return None


def _cache_set(key: str, value: dict[str, Any]) -> None:
    try:
        from macro_data.cache import cache_set

        cache_set(key, value, ttl=CACHE_TTL)
    except Exception:
        pass


def get_super_summary_payload(*, refresh: bool = False, force: bool = False) -> dict[str, Any]:
    """
    Build fact pack + hybrid commentary.
    force/refresh: rebuild pack and skip LLM cache.
    """
    force = force or refresh
    t0 = time.time()
    _ensure_project_env()
    has_key = bool(_llm_api_key())

    # Fast fact pack from warm stores so we still have time for xAI.
    # Only hard-refresh when coverage is critically thin (empty first visit).
    pack = build_fact_pack(refresh=False)
    if (pack.get("coveragePct") or 0) < 30:
        pack = build_fact_pack(refresh=True)

    # Cache key — never stick forever on rules-only when a key is configured
    cache_key = f"super-summary:v5:{pack.get('hash')}"

    if not force:
        cached = _cache_get(cache_key)
        if cached and cached.get("markdown"):
            # Re-use successful LLM results only. If we only had rules, retry xAI when key exists.
            if cached.get("usedLlm"):
                out = dict(cached)
                out["fromCache"] = True
                out["factPack"] = pack
                out["llmConfigured"] = has_key
                return out
            if not has_key:
                out = dict(cached)
                out["fromCache"] = True
                out["factPack"] = pack
                out["llmConfigured"] = False
                return out

    domain_sec = round(time.time() - t0, 1)

    # Always attempt xAI when the key is present — do not skip for domain budget.
    # (Skipping was why users with free quota still saw rules-only commentary.)
    if not has_key:
        llm = {
            "error": "XAI_API_KEY not set in environment (local: .env.local; Vercel: project env vars)"
        }
    else:
        llm = _call_xai(pack, timeout=LLM_TIMEOUT)

    used_llm = bool(llm and llm.get("markdown") and not llm.get("error"))

    if used_llm:
        markdown = llm["markdown"]
        usage = llm.get("usage") or _estimate_tokens(markdown)
        model = llm.get("model") or _default_model()
        llm_error = None
    else:
        markdown = _rules_only_markdown(pack)
        usage = _estimate_tokens(markdown)
        model = "rules-only"
        llm_error = (llm or {}).get("error") or (
            "XAI_API_KEY not set (local: project .env.local; production: Vercel env)"
            if not has_key
            else "LLM call failed"
        )

    conf = _confidence(pack, used_llm)
    conf_label = (
        "Moderate–high"
        if conf >= 60
        else "Moderate"
        if conf >= 45
        else "Low–moderate"
        if conf >= 30
        else "Low"
    )

    # Short bullets for Home card
    cycle = (pack.get("domains") or {}).get("cycle") or {}
    headlines = []
    if cycle.get("available"):
        headlines.append(
            f"{cycle.get('phase')}: {cycle.get('drawdownFromAthPct')}% from ATH, "
            f"{cycle.get('daysSincePeak')}d since peak"
        )
    val_cells = ((pack.get("domains") or {}).get("valuation") or {}).get("cells") or {}
    if val_cells.get("mvrv_z_score", {}).get("value") is not None:
        headlines.append(f"MVRV Z {val_cells['mvrv_z_score']['value']}")
    if val_cells.get("fear_greed", {}).get("value") is not None:
        headlines.append(f"Fear & Greed {val_cells['fear_greed']['value']}")
    sent = (pack.get("domains") or {}).get("sentiment") or {}
    if sent.get("fearGreed") is not None and not val_cells.get("fear_greed"):
        headlines.append(f"Fear & Greed {sent.get('fearGreed')}")
    headlines.append(f"Coverage {pack.get('coveragePct')}%")

    result = {
        "markdown": markdown,
        "headlines": headlines[:6],
        "confidence": conf,
        "confidenceLabel": conf_label,
        "usedLlm": used_llm,
        "llmConfigured": has_key,
        "usage": usage,
        "costUsd": round(_cost_usd(usage), 6) if used_llm else None,
        "costRates": {"inPerM": COST_IN_PER_M, "outPerM": COST_OUT_PER_M},
        "model": model,
        "generatedAt": _now_iso(),
        "factPackHash": pack.get("hash"),
        "coveragePct": pack.get("coveragePct"),
        "staleFlags": pack.get("staleFlags") or [],
        "sources": pack.get("sources") or [],
        "llmError": llm_error,
        "fromCache": False,
        "factPack": pack,
        "phase": cycle.get("phase"),
        "timing": {
            "domainSec": domain_sec,
            "totalSec": round(time.time() - t0, 1),
            "llmTimeoutSec": LLM_TIMEOUT if has_key else None,
        },
        "cycle": {
            "spot": cycle.get("spot"),
            "drawdownFromAthPct": cycle.get("drawdownFromAthPct"),
            "daysSincePeak": cycle.get("daysSincePeak"),
            "daysSinceHalving": cycle.get("daysSinceHalving"),
        }
        if cycle.get("available")
        else None,
    }

    # Cache without full factPack to save space (re-attach on hit)
    to_cache = {k: v for k, v in result.items() if k != "factPack"}
    try:
        from macro_data.cache import cache_set

        ttl = CACHE_TTL if used_llm else CACHE_TTL_RULES
        cache_set(cache_key, to_cache, ttl=ttl)
    except Exception:
        _cache_set(cache_key, to_cache)
    return result
