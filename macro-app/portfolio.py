"""
Lightweight portfolio tracker — works across app tabs via dcc.Store persistence.

Uses Yahoo Finance (yfinance) for mark-to-market. Delayed ~15 min; not for execution.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

try:
    import yfinance as yf

    HAS_YF = True
except ImportError:
    HAS_YF = False


def empty_portfolio() -> list[dict]:
    return []


def normalize_holdings(raw: list | None) -> list[dict]:
    if not raw:
        return []
    out = []
    for row in raw:
        sym = str(row.get("symbol", "")).strip().upper()
        if not sym:
            continue
        try:
            shares = float(row.get("shares") or 0)
            cost = float(row.get("cost") or 0)
        except (TypeError, ValueError):
            continue
        out.append({"symbol": sym, "shares": shares, "cost": cost})
    return out


def fetch_portfolio_quotes(symbols: list[str]) -> dict[str, float]:
    if not HAS_YF or not symbols:
        return {}
    try:
        data = yf.download(
            symbols if len(symbols) > 1 else symbols[0],
            period="5d",
            progress=False,
            auto_adjust=True,
            threads=False,
        )
        if data is None or data.empty:
            return {}
        if len(symbols) == 1:
            close = data["Close"].dropna()
            if close.empty:
                return {}
            return {symbols[0]: float(close.iloc[-1])}
        close = data["Close"].iloc[-1]
        return {sym: float(close[sym]) for sym in symbols if sym in close and pd.notna(close[sym])}
    except Exception:
        return {}


def portfolio_summary(holdings: list[dict]) -> dict[str, Any]:
    holdings = normalize_holdings(holdings)
    if not holdings:
        return {"rows": [], "total_value": 0, "total_cost": 0, "total_pnl": 0, "total_pnl_pct": None}

    syms = [h["symbol"] for h in holdings]
    prices = fetch_portfolio_quotes(syms)
    rows = []
    total_value = 0.0
    total_cost = 0.0

    for h in holdings:
        px = prices.get(h["symbol"])
        mv = px * h["shares"] if px is not None else None
        cost_basis = h["cost"] * h["shares"]
        pnl = (mv - cost_basis) if mv is not None else None
        pnl_pct = (pnl / cost_basis * 100) if pnl is not None and cost_basis else None
        if mv is not None:
            total_value += mv
        total_cost += cost_basis
        rows.append(
            {
                **h,
                "price": px,
                "market_value": mv,
                "cost_basis": cost_basis,
                "pnl": pnl,
                "pnl_pct": pnl_pct,
            }
        )

    total_pnl = total_value - total_cost if total_value else None
    total_pnl_pct = (total_pnl / total_cost * 100) if total_pnl is not None and total_cost else None
    return {
        "rows": rows,
        "total_value": total_value,
        "total_cost": total_cost,
        "total_pnl": total_pnl,
        "total_pnl_pct": total_pnl_pct,
    }