"""Global Equity Insights — analytics payloads for Vercel API (no Streamlit)."""

from __future__ import annotations

import time
from datetime import date, datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

CACHE_TTL = 300
_cache: dict[str, dict] = {}

INDICES: dict[str, str] = {
    "S&P 500": "^GSPC",
    "Dow Jones": "^DJI",
    "Nasdaq Composite": "^IXIC",
    "FTSE 100": "^FTSE",
    "DAX": "^GDAXI",
    "CAC 40": "^FCHI",
    "Nikkei 225": "^N225",
    "Hang Seng": "^HSI",
    "Shanghai Composite": "000001.SS",
    "KOSPI": "^KS11",
    "Nifty 50": "^NSEI",
    "ASX 200": "^AXJO",
    "S&P/TSX Composite": "^GSPTSE",
    "MSCI ACWI": "ACWI",
    "MSCI Emerging Markets": "EEM",
}

INDEX_GEO: dict[str, dict[str, Any]] = {
    "^GSPC": {"lat": 40.7, "lon": -74.0, "country": "United States"},
    "^DJI": {"lat": 40.7, "lon": -74.0, "country": "United States"},
    "^IXIC": {"lat": 37.4, "lon": -122.1, "country": "United States"},
    "^FTSE": {"lat": 51.5, "lon": -0.1, "country": "United Kingdom"},
    "^GDAXI": {"lat": 50.1, "lon": 8.7, "country": "Germany"},
    "^FCHI": {"lat": 48.9, "lon": 2.3, "country": "France"},
    "^N225": {"lat": 35.7, "lon": 139.7, "country": "Japan"},
    "^HSI": {"lat": 22.3, "lon": 114.2, "country": "Hong Kong"},
    "000001.SS": {"lat": 31.2, "lon": 121.5, "country": "China"},
    "^KS11": {"lat": 37.6, "lon": 127.0, "country": "South Korea"},
    "^NSEI": {"lat": 19.1, "lon": 72.9, "country": "India"},
    "^AXJO": {"lat": -33.9, "lon": 151.2, "country": "Australia"},
    "^GSPTSE": {"lat": 43.7, "lon": -79.4, "country": "Canada"},
    "ACWI": {"lat": 46.0, "lon": 2.0, "country": "Global"},
    "EEM": {"lat": 22.0, "lon": 114.0, "country": "Emerging Markets"},
}

DEFAULT_COMPANIES = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA",
    "AMD", "TSM", "BABA", "SAP", "0700.HK",
]

PERIOD_DAYS = {
    "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "3Y": 365 * 3, "5Y": 365 * 5,
}


def period_to_dates(preset: str, start_str: str | None, end_str: str | None) -> tuple[str, str]:
    end = date.today()
    if start_str and end_str:
        return start_str[:10], end_str[:10]
    if preset == "YTD":
        return str(date(end.year, 1, 1)), str(end)
    if preset == "Max":
        return "1990-01-01", str(end)
    days = PERIOD_DAYS.get(preset, 365)
    return str(end - timedelta(days=days)), str(end)


def _safe_float(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
        if np.isnan(f) or np.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def _fmt_date(idx) -> str:
    if hasattr(idx, "strftime"):
        return idx.strftime("%Y-%m-%d")
    return str(idx)[:10]


def _closes_for_symbol(data, symbol, multi):
    if data is None or getattr(data, "empty", True):
        return None
    try:
        cols = getattr(data, "columns", None)
        if cols is not None and getattr(cols, "nlevels", 1) > 1:
            level0 = cols.get_level_values(0)
            if symbol in level0:
                return data[symbol]["Close"].dropna()
            level1 = cols.get_level_values(1)
            if symbol in level1:
                return data.xs("Close", axis=1, level=0)[symbol].dropna()
        if "Close" in data:
            close = data["Close"]
            if getattr(close, "ndim", 1) > 1 and symbol in getattr(close, "columns", []):
                return close[symbol].dropna()
            return close.dropna()
    except Exception:
        return None
    return None


def _extract_ohlcv(data: pd.DataFrame, ticker: str) -> pd.DataFrame:
    if data is None or data.empty:
        return pd.DataFrame()
    if isinstance(data.columns, pd.MultiIndex):
        if ticker in data.columns.get_level_values(0):
            df = data[ticker].copy()
        elif ticker in data.columns.get_level_values(1):
            df = data.xs(ticker, axis=1, level=1).copy()
        else:
            return pd.DataFrame()
    else:
        df = data.copy()
    df = df.rename(columns=str.title)
    cols = [c for c in ["Open", "High", "Low", "Close", "Volume"] if c in df.columns]
    return df[cols].dropna(how="all") if cols else pd.DataFrame()


def download_history(symbols: list[str], start: str, end: str) -> dict[str, pd.DataFrame]:
    unique = [s for s in dict.fromkeys(symbols) if s]
    if not unique:
        return {}
    end_dl = (datetime.strptime(end[:10], "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
    out: dict[str, pd.DataFrame] = {}
    chunk_size = 6
    for i in range(0, len(unique), chunk_size):
        chunk = unique[i : i + chunk_size]
        try:
            raw = yf.download(
                chunk,
                start=start[:10],
                end=end_dl,
                group_by="ticker",
                auto_adjust=True,
                progress=False,
                threads=False,
            )
            multi = len(chunk) > 1
            for sym in chunk:
                if sym in out:
                    continue
                if multi:
                    df = _extract_ohlcv(raw, sym)
                else:
                    df = _extract_ohlcv(raw, chunk[0])
                if not df.empty:
                    out[sym] = df
        except Exception:
            continue
    for sym in unique:
        if sym in out:
            continue
        try:
            raw = yf.download(sym, start=start[:10], end=end_dl, auto_adjust=True, progress=False)
            df = _extract_ohlcv(raw, sym)
            if not df.empty:
                out[sym] = df
        except Exception:
            continue
    return out


def compute_period_returns(close: pd.Series) -> dict[str, float | None]:
    if close is None or close.empty:
        return {"1D": None, "WTD": None, "MTD": None, "YTD": None, "1Y": None}
    close = close.dropna()
    if close.empty:
        return {"1D": None, "WTD": None, "MTD": None, "YTD": None, "1Y": None}
    last = close.iloc[-1]
    as_of = close.index[-1]

    def ret_at(ts) -> float | None:
        if ts is None:
            return None
        subset = close[close.index <= ts]
        if subset.empty:
            return None
        base = subset.iloc[-1]
        if not base:
            return None
        return (last / base - 1) * 100

    d1 = ret_at(close.index[-2]) if len(close) >= 2 else None
    week_start = as_of - pd.Timedelta(days=as_of.weekday())
    month_start = as_of.replace(day=1)
    year_start = as_of.replace(month=1, day=1)
    y1_idx = close.index.searchsorted(as_of - pd.Timedelta(days=365))
    y1 = close.index[max(0, y1_idx - 1)] if y1_idx > 0 else None
    return {
        "1D": _safe_float(d1),
        "WTD": _safe_float(ret_at(week_start)),
        "MTD": _safe_float(ret_at(month_start)),
        "YTD": _safe_float(ret_at(year_start)),
        "1Y": _safe_float(ret_at(y1)),
    }


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "Close" not in df.columns:
        return df
    out = df.copy()
    close = out["Close"]
    high = out["High"] if "High" in out.columns else close
    low = out["Low"] if "Low" in out.columns else close
    out["SMA20"] = close.rolling(20).mean()
    out["SMA50"] = close.rolling(50).mean()
    out["SMA200"] = close.rolling(200).mean()
    mid = close.rolling(20).mean()
    std = close.rolling(20).std()
    out["BB_Mid"] = mid
    out["BB_Upper"] = mid + 2 * std
    out["BB_Lower"] = mid - 2 * std
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    out["RSI"] = 100 - (100 / (1 + rs))
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    out["MACD"] = ema12 - ema26
    out["MACD_Signal"] = out["MACD"].ewm(span=9, adjust=False).mean()
    out["MACD_Hist"] = out["MACD"] - out["MACD_Signal"]
    low14 = low.rolling(14).min()
    high14 = high.rolling(14).max()
    out["STOCH_K"] = 100 * (close - low14) / (high14 - low14).replace(0, np.nan)
    out["STOCH_D"] = out["STOCH_K"].rolling(3).mean()
    return out


def interpret_signals(df: pd.DataFrame) -> list[dict]:
    msgs = []
    if df.empty or "Close" not in df.columns:
        return msgs
    row = df.dropna(subset=["Close"]).iloc[-1]
    rsi = _safe_float(row.get("RSI"))
    if rsi is not None:
        if rsi > 70:
            msgs.append({"level": "warning", "text": f"RSI overbought at {rsi:.1f} (>70)"})
        elif rsi < 30:
            msgs.append({"level": "info", "text": f"RSI oversold at {rsi:.1f} (<30)"})
    s50, s200 = _safe_float(row.get("SMA50")), _safe_float(row.get("SMA200"))
    if s50 is not None and s200 is not None:
        if s50 > s200:
            msgs.append({"level": "info", "text": "Golden cross active (SMA50 > SMA200)"})
        else:
            msgs.append({"level": "warning", "text": "Death cross active (SMA50 < SMA200)"})
    macd, sig = _safe_float(row.get("MACD")), _safe_float(row.get("MACD_Signal"))
    if macd is not None and sig is not None:
        if macd > sig:
            msgs.append({"level": "info", "text": "MACD above signal line (bullish momentum)"})
        else:
            msgs.append({"level": "warning", "text": "MACD below signal line (bearish momentum)"})
    return msgs


def _ohlcv_json(df: pd.DataFrame, include_indicators: bool = False) -> list[dict]:
    key_map = {
        "Open": "open", "High": "high", "Low": "low", "Close": "close", "Volume": "volume",
        "SMA20": "sma20", "SMA50": "sma50", "SMA200": "sma200",
        "BB_Upper": "bbUpper", "BB_Mid": "bbMid", "BB_Lower": "bbLower",
        "RSI": "rsi", "MACD": "macd", "MACD_Signal": "macdSignal",
        "MACD_Hist": "macdHist", "STOCH_K": "stochK", "STOCH_D": "stochD",
    }
    cols = list(key_map.keys()) if include_indicators else list(key_map.keys())[:5]
    rows = []
    for idx, row in df.iterrows():
        item = {"date": _fmt_date(idx)}
        for c in cols:
            if c in df.columns:
                item[key_map[c]] = _safe_float(row[c])
        rows.append(item)
    return rows


def _df_stmt_json(df: pd.DataFrame, max_cols: int = 6) -> list[dict]:
    if df is None or df.empty:
        return []
    rows = []
    for label in df.index[:12]:
        row = {"line": str(label)}
        for i, col in enumerate(df.columns[:max_cols]):
            row[f"p{i}"] = _safe_float(df.loc[label, col])
            row[f"period_{i}"] = _fmt_date(col) if hasattr(col, "strftime") else str(col)[:10]
        rows.append(row)
    return rows


def build_global_payload(symbols: list[str], start: str, end: str, movers_key: str = "YTD") -> dict:
    name_by_ticker = {v: k for k, v in INDICES.items()}
    labels = {sym: name_by_ticker.get(sym, sym) for sym in symbols}
    history = download_history(symbols, start, end)

    overview = []
    for sym in symbols:
        df = history.get(sym, pd.DataFrame())
        rets = compute_period_returns(df["Close"]) if not df.empty and "Close" in df.columns else {}
        vol = _safe_float(df["Volume"].iloc[-1]) if not df.empty and "Volume" in df.columns else None
        price = _safe_float(df["Close"].iloc[-1]) if not df.empty and "Close" in df.columns else None
        overview.append({
            "name": labels[sym],
            "ticker": sym,
            "price": price,
            "volume": vol,
            **rets,
        })

    closes = pd.DataFrame({s: h["Close"] for s, h in history.items() if "Close" in h.columns})
    closes = closes.dropna(how="all")

    performance = {"dates": [], "series": {}}
    if not closes.empty:
        rebased = (closes.divide(closes.iloc[0].replace(0, np.nan)) * 100).dropna(how="all")
        performance["dates"] = [_fmt_date(d) for d in rebased.index]
        for col in rebased.columns:
            performance["series"][labels.get(col, col)] = [
                _safe_float(v) for v in rebased[col].tolist()
            ]

    correlation = {"labels": [], "matrix": []}
    volatility = {"dates": [], "series": {}}
    if closes.shape[1] >= 2:
        rets = closes.pct_change().dropna(how="all")
        corr = rets.corr()
        correlation["labels"] = [labels.get(c, c) for c in corr.columns]
        correlation["matrix"] = [
            [_safe_float(corr.loc[r, c]) for c in corr.columns] for r in corr.index
        ]
        for col in rets.columns:
            for w in (30, 60):
                vol = rets[col].rolling(w).std() * np.sqrt(252) * 100
                key = f"{labels.get(col, col)} {w}d"
                if not volatility["dates"]:
                    volatility["dates"] = [_fmt_date(d) for d in vol.dropna().index]
                volatility["series"][key] = [_safe_float(v) for v in vol.dropna().tolist()]

    movers_map = {"1D": "1D", "WTD": "WTD", "MTD": "MTD", "YTD": "YTD", "1Y": "1Y"}
    mk = movers_map.get(movers_key, "YTD")
    geo = []
    for row in overview:
        sym = row["ticker"]
        g = INDEX_GEO.get(sym)
        if not g:
            continue
        ret = row.get(mk)
        geo.append({
            "name": row["name"],
            "ticker": sym,
            "lat": g["lat"],
            "lon": g["lon"],
            "country": g["country"],
            "returnPct": ret,
            "absReturn": abs(ret) if ret is not None else 0.5,
        })

    sorted_ov = sorted(
        [r for r in overview if r.get(mk) is not None],
        key=lambda x: x[mk],
        reverse=True,
    )
    movers = {
        "period": mk,
        "top": [{"name": r["name"], "ticker": r["ticker"], "returnPct": r[mk]} for r in sorted_ov[:5]],
        "bottom": [{"name": r["name"], "ticker": r["ticker"], "returnPct": r[mk]} for r in sorted_ov[-5:]],
    }

    return {
        "section": "global",
        "start": start,
        "end": end,
        "indices": INDICES,
        "overview": overview,
        "performance": performance,
        "correlation": correlation,
        "volatility": volatility,
        "geo": geo,
        "movers": movers,
        "source": "Yahoo Finance via yfinance",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def build_company_payload(symbol: str, peers: list[str], start: str, end: str) -> dict:
    symbol = symbol.strip().upper()
    peers = [p.strip().upper() for p in peers if p and p.upper() != symbol]
    all_syms = [symbol] + peers
    history = download_history(all_syms, start, end)

    info = {}
    try:
        info = yf.Ticker(symbol).info or {}
    except Exception:
        pass

    df = history.get(symbol, pd.DataFrame())
    if not df.empty:
        df = add_indicators(df)

    fin = {"income": [], "balance": [], "cashflow": [], "ratios": []}
    dividends = []
    try:
        t = yf.Ticker(symbol)
        income = t.financials
        balance = t.balance_sheet
        cashflow = t.cashflow
        divs = t.dividends
        if income is not None and not income.empty:
            fin["income"] = _df_stmt_json(income)
        if balance is not None and not balance.empty:
            fin["balance"] = _df_stmt_json(balance)
            for i, col in enumerate(balance.columns[:4]):
                try:
                    debt = balance.loc["Total Debt", col] if "Total Debt" in balance.index else np.nan
                    equity = balance.loc["Stockholders Equity", col] if "Stockholders Equity" in balance.index else np.nan
                    cur_a = balance.loc["Current Assets", col] if "Current Assets" in balance.index else np.nan
                    cur_l = balance.loc["Current Liabilities", col] if "Current Liabilities" in balance.index else np.nan
                    fin["ratios"].append({
                        "period": _fmt_date(col),
                        "debtEquity": _safe_float(debt / equity) if equity and not np.isnan(equity) else None,
                        "currentRatio": _safe_float(cur_a / cur_l) if cur_l and not np.isnan(cur_l) else None,
                    })
                except Exception:
                    continue
        if cashflow is not None and not cashflow.empty:
            fin["cashflow"] = _df_stmt_json(cashflow)
        if divs is not None and not divs.empty:
            dividends = [{"date": _fmt_date(d), "amount": _safe_float(v)} for d, v in divs.items()]
    except Exception:
        pass

    price_return = None
    if not df.empty and "Close" in df.columns and len(df) >= 2:
        price_return = _safe_float((df["Close"].iloc[-1] / df["Close"].iloc[0] - 1) * 100)

    peer_rows = []
    peer_perf = {"dates": [], "series": {}}
    peer_closes = pd.DataFrame({
        s: history[s]["Close"] for s in all_syms if s in history and "Close" in history[s].columns
    })
    if not peer_closes.empty:
        rebased = (peer_closes.divide(peer_closes.iloc[0].replace(0, np.nan)) * 100).dropna(how="all")
        peer_perf["dates"] = [_fmt_date(d) for d in rebased.index]
        for col in rebased.columns:
            peer_perf["series"][col] = [_safe_float(v) for v in rebased[col].tolist()]

    for sym in all_syms:
        inf = info if sym == symbol else {}
        if sym != symbol:
            try:
                inf = yf.Ticker(sym).info or {}
            except Exception:
                inf = {}
        peer_rows.append({
            "ticker": sym,
            "marketCap": inf.get("marketCap"),
            "pe": _safe_float(inf.get("trailingPE")),
            "forwardPe": _safe_float(inf.get("forwardPE")),
            "priceToBook": _safe_float(inf.get("priceToBook")),
            "evEbitda": _safe_float(inf.get("enterpriseToEbitda")),
            "profitMargin": _safe_float((inf.get("profitMargins") or 0) * 100),
        })

    return {
        "section": "company",
        "symbol": symbol,
        "peers": peers,
        "start": start,
        "end": end,
        "info": {
            "name": info.get("longName") or info.get("shortName") or symbol,
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "currency": info.get("currency") or "USD",
            "price": _safe_float(info.get("currentPrice") or info.get("regularMarketPrice")),
            "changePct": _safe_float(info.get("regularMarketChangePercent")),
            "marketCap": info.get("marketCap"),
            "pe": _safe_float(info.get("trailingPE")),
            "eps": _safe_float(info.get("trailingEps")),
            "divYield": _safe_float((info.get("dividendYield") or 0) * 100) if info.get("dividendYield") else None,
            "beta": _safe_float(info.get("beta")),
            "fiftyTwoWeekHigh": _safe_float(info.get("fiftyTwoWeekHigh")),
            "fiftyTwoWeekLow": _safe_float(info.get("fiftyTwoWeekLow")),
        },
        "ohlcv": _ohlcv_json(df, include_indicators=True) if not df.empty else [],
        "signals": interpret_signals(df),
        "financials": fin,
        "dividends": dividends,
        "priceReturn": price_return,
        "peersTable": peer_rows,
        "peerPerformance": peer_perf,
        "defaultCompanies": DEFAULT_COMPANIES,
        "source": "Yahoo Finance via yfinance",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def get_equity_global_payload(symbols, start, end, movers_period="YTD", period_preset="1Y"):
    if not start or not end:
        start, end = period_to_dates(period_preset, None, None)
    sym_list = symbols or list(INDICES.values())
    key = f"equity:global:{','.join(sym_list)}:{start}:{end}:{movers_period}"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]
    data = build_global_payload(sym_list, start, end, movers_period)
    _cache[key] = {"ts": now, "data": data}
    return data


def get_equity_company_payload(symbol, peers, start, end, period_preset="1Y"):
    if not symbol:
        raise ValueError("Missing symbol")
    if not start or not end:
        start, end = period_to_dates(period_preset, None, None)
    peer_list = peers or []
    key = f"equity:company:{symbol}:{','.join(peer_list)}:{start}:{end}"
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]
    data = build_company_payload(symbol, peer_list, start, end)
    _cache[key] = {"ts": now, "data": data}
    return data