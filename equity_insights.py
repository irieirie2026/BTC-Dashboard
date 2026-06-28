"""Global Equity Insights — analytics payloads for Vercel API (no Streamlit)."""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
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
    "1M": 30,
    "3M": 90,
    "6M": 180,
    "1Y": 365,
    "2Y": 365 * 2,
    "3Y": 365 * 3,
    "5Y": 365 * 5,
    "10Y": 365 * 10,
}

PERF_PERIOD_PRESETS = frozenset({"1W", "1M", "1Q", "1Y", "WTD", "MTD", "YTD", "3Y", "5Y"})


def normalize_perf_period(preset: str | None) -> str:
    key = (preset or "1Y").strip().upper()
    return key if key in PERF_PERIOD_PRESETS else "1Y"


def perf_period_start_ts(as_of: pd.Timestamp, preset: str) -> pd.Timestamp:
    preset = normalize_perf_period(preset)
    if preset == "1W":
        return as_of - pd.Timedelta(days=7)
    if preset == "1M":
        return as_of - pd.Timedelta(days=30)
    if preset == "1Q":
        return as_of - pd.Timedelta(days=90)
    if preset == "1Y":
        return as_of - pd.Timedelta(days=365)
    if preset == "3Y":
        return as_of - pd.Timedelta(days=365 * 3)
    if preset == "5Y":
        return as_of - pd.Timedelta(days=365 * 5)
    if preset == "WTD":
        return as_of - pd.Timedelta(days=int(as_of.weekday()))
    if preset == "MTD":
        return as_of.replace(day=1)
    if preset == "YTD":
        return as_of.replace(month=1, day=1)
    return as_of - pd.Timedelta(days=365)


def slice_closes_for_perf_period(closes: pd.DataFrame, preset: str) -> pd.DataFrame:
    if closes is None or closes.empty:
        return closes
    as_of = closes.index[-1]
    start = perf_period_start_ts(as_of, preset)
    mask = closes.index >= start
    if not mask.any():
        return closes.tail(max(5, min(len(closes), 10)))
    first_idx = closes.index[mask][0]
    pos = closes.index.get_loc(first_idx)
    if isinstance(pos, slice):
        pos = pos.start if pos.start is not None else 0
    return closes.iloc[int(pos):]


def build_performance_series(closes: pd.DataFrame, labels: dict[str, str], preset: str) -> dict:
    performance = {"dates": [], "series": {}, "period": normalize_perf_period(preset)}
    perf_closes = slice_closes_for_perf_period(closes, preset)
    if perf_closes is None or perf_closes.empty:
        return performance
    rebased = (perf_closes.divide(perf_closes.iloc[0].replace(0, np.nan)) * 100).dropna(how="all")
    performance["dates"] = [_fmt_date(d) for d in rebased.index]
    for col in rebased.columns:
        performance["series"][labels.get(col, col)] = [
            _safe_float(v) for v in rebased[col].tolist()
        ]
    return performance


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


def _news_url_from_item(item: dict) -> str | None:
    content = item.get("content") or item
    for key in ("canonicalUrl", "clickThroughUrl", "previewUrl"):
        obj = content.get(key)
        if isinstance(obj, dict) and obj.get("url"):
            return obj["url"]
        if isinstance(obj, str) and obj:
            return obj
    return content.get("link") or content.get("url") or item.get("link") or item.get("url")


def _news_timestamp(item: dict) -> tuple[str | None, int]:
    content = item.get("content") or item
    candidates = [
        content.get("pubDate"),
        content.get("displayTime"),
        item.get("providerPublishTime"),
    ]
    for raw in candidates:
        if raw is None or raw == "":
            continue
        if isinstance(raw, (int, float)):
            try:
                secs = int(raw)
                if secs > 1_000_000_000_000:
                    secs = secs // 1000
                iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(secs))
                return iso, secs * 1000
            except (TypeError, ValueError, OSError):
                continue
        text = str(raw).strip()
        if not text:
            continue
        if text.endswith("Z"):
            iso = text
        elif "+" in text[10:] or text.endswith("UTC"):
            iso = text.replace("UTC", "Z")
        elif "T" in text:
            iso = f"{text}Z"
        else:
            iso = f"{text}T00:00:00Z"
        try:
            parsed = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            ms = int(parsed.timestamp() * 1000)
            return parsed.strftime("%Y-%m-%dT%H:%M:%SZ"), ms
        except ValueError:
            continue
    return None, 0


def _news_published_at(item: dict) -> str | None:
    iso, _ = _news_timestamp(item)
    return iso


def _news_source_name(item: dict) -> str:
    content = item.get("content") or item
    provider = content.get("provider") or item.get("provider")
    if isinstance(provider, dict):
        return provider.get("displayName") or "Yahoo Finance"
    return item.get("publisher") or "Yahoo Finance"


def _news_items_for_symbol(sym: str, per_symbol: int) -> list[dict]:
    if not sym:
        return []
    try:
        return list((yf.Ticker(sym).news or [])[:per_symbol])
    except Exception:
        return []


def fetch_stock_news(symbols: list[str], per_symbol: int = 8, max_total: int = 50) -> list[dict]:
    unique_symbols = list(dict.fromkeys([s for s in symbols if s]))[:12]
    if not unique_symbols:
        return []

    by_key: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=min(6, len(unique_symbols))) as pool:
        futures = {
            pool.submit(_news_items_for_symbol, sym, per_symbol): sym
            for sym in unique_symbols
        }
        for future in as_completed(futures):
            sym = futures[future]
            try:
                items = future.result()
            except Exception:
                continue
            for item in items:
                content = item.get("content") or item
                link = _news_url_from_item(item)
                key = link or content.get("id") or item.get("id")
                if not key:
                    continue
                published_at, published_ms = _news_timestamp(item)
                if key in by_key:
                    if sym not in by_key[key]["symbols"]:
                        by_key[key]["symbols"].append(sym)
                    if published_ms > by_key[key].get("publishedAtMs", 0):
                        by_key[key]["publishedAt"] = published_at
                        by_key[key]["publishedAtMs"] = published_ms
                    continue
                by_key[key] = {
                    "title": content.get("title") or item.get("title") or "Untitled",
                    "link": link or "#",
                    "source": _news_source_name(item),
                    "publishedAt": published_at,
                    "publishedAtMs": published_ms,
                    "symbols": [sym],
                }

    articles = sorted(
        by_key.values(),
        key=lambda a: a.get("publishedAtMs", 0),
        reverse=True,
    )
    return articles[:max_total]


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


def _sanitize_ohlcv_df(df: pd.DataFrame) -> pd.DataFrame:
    """Drop rows without a settled close (incomplete same-day bars from yfinance)."""
    if df is None or df.empty:
        return pd.DataFrame()
    if "Close" in df.columns:
        df = df.dropna(subset=["Close"])
    return df.dropna(how="all")


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
    if not cols:
        return pd.DataFrame()
    return _sanitize_ohlcv_df(df[cols])


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


def _index_year(idx) -> int | None:
    if hasattr(idx, "year"):
        return idx.year
    try:
        return int(str(idx)[:4])
    except (TypeError, ValueError):
        return None


def perf_from_closes(close: pd.Series) -> dict[str, float | None] | None:
    """Match TradFi indices perf columns (1W/1M/3M/12M/YTD from trading-day offsets)."""
    if close is None or close.empty:
        return None
    closes = close.dropna()
    count = len(closes)
    if count < 2:
        return None

    current = _safe_float(closes.iloc[-1])
    if not current:
        return None

    def ret_at(offset: int) -> float | None:
        pos = count - 1 - offset
        if pos < 0:
            return None
        base = _safe_float(closes.iloc[pos])
        if not base:
            return None
        return ((current / base) - 1) * 100

    ytd = None
    last_year = _index_year(closes.index[-1])
    if last_year is not None:
        base = None
        for i in range(count):
            year = _index_year(closes.index[i])
            if year is not None and year >= last_year:
                if i > 0:
                    base = _safe_float(closes.iloc[i - 1])
                break
        if base:
            ytd = ((current / base) - 1) * 100

    return {
        "w1": ret_at(5),
        "m1": ret_at(21),
        "m3": ret_at(63),
        "m12": ret_at(252),
        "ytd": ytd,
    }


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
    out["WILLR"] = -100 * (high14 - close) / (high14 - low14).replace(0, np.nan)
    prev_close = close.shift(1)
    tr = pd.concat(
        [high - low, (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    out["ATR"] = tr.rolling(14).mean()
    typical = (high + low + close) / 3
    tp_sma = typical.rolling(20).mean()
    tp_mad = typical.rolling(20).apply(
        lambda x: float(np.abs(x - x.mean()).mean()),
        raw=True,
    )
    out["CCI"] = (typical - tp_sma) / (0.015 * tp_mad.replace(0, np.nan))
    return out


def interpret_signals(df: pd.DataFrame) -> list[dict]:
    msgs = []
    if df.empty or "Close" not in df.columns:
        return msgs
    row = df.dropna(subset=["Close"]).iloc[-1]
    rsi = _safe_float(row.get("RSI"))
    if rsi is not None:
        if rsi > 70:
            msgs.append({
                "level": "bearish",
                "text": f"RSI at {rsi:.1f} — overbought territory (>70). Price may be extended; watch for pullback or consolidation.",
            })
        elif rsi < 30:
            msgs.append({
                "level": "bullish",
                "text": f"RSI at {rsi:.1f} — oversold territory (<30). Selling pressure may be exhausted; bounce risk rises.",
            })
        else:
            msgs.append({
                "level": "neutral",
                "text": f"RSI at {rsi:.1f} — neutral zone (30–70). No extreme momentum signal from RSI alone.",
            })
    s50, s200 = _safe_float(row.get("SMA50")), _safe_float(row.get("SMA200"))
    if s50 is not None and s200 is not None:
        if s50 > s200:
            msgs.append({
                "level": "bullish",
                "text": "Golden cross: 50-day average above 200-day. Medium-term trend often considered constructive.",
            })
        else:
            msgs.append({
                "level": "bearish",
                "text": "Death cross: 50-day average below 200-day. Medium-term trend often considered weak.",
            })
    macd, sig = _safe_float(row.get("MACD")), _safe_float(row.get("MACD_Signal"))
    if macd is not None and sig is not None:
        if macd > sig:
            msgs.append({
                "level": "bullish",
                "text": "MACD above its signal line — short-term momentum skews positive.",
            })
        else:
            msgs.append({
                "level": "bearish",
                "text": "MACD below its signal line — short-term momentum skews negative.",
            })
    stoch = _safe_float(row.get("STOCH_K"))
    if stoch is not None:
        if stoch > 80:
            msgs.append({
                "level": "bearish",
                "text": f"Stochastic %K at {stoch:.1f} — near overbought (>80).",
            })
        elif stoch < 20:
            msgs.append({
                "level": "bullish",
                "text": f"Stochastic %K at {stoch:.1f} — near oversold (<20).",
            })
    return msgs


def _company_summary(info: dict, price_return: float | None) -> dict:
    price = _safe_float(info.get("price"))
    high = _safe_float(info.get("fiftyTwoWeekHigh"))
    low = _safe_float(info.get("fiftyTwoWeekLow"))
    range_pct = None
    if price is not None and high is not None and low is not None and high > low:
        range_pct = _safe_float((price - low) / (high - low) * 100)
    return {
        "priceReturn": price_return,
        "range52wPct": range_pct,
        "fiftyTwoWeekHigh": high,
        "fiftyTwoWeekLow": low,
    }


def build_company_commentary(
    symbol: str,
    info: dict,
    df: pd.DataFrame,
    signals: list[dict],
    price_return: float | None,
    fin: dict,
    peers: list[str],
) -> list[str]:
    name = info.get("name") or symbol
    sector = info.get("sector") or "its sector"
    industry = info.get("industry")
    paragraphs: list[str] = []

    intro = f"{name} ({symbol})"
    if industry:
        intro += f" operates in {industry}"
    intro += f" within {sector}."
    if price_return is not None:
        direction = "up" if price_return >= 0 else "down"
        intro += f" Over the selected period the share price is {direction} {abs(price_return):.1f}%."
    paragraphs.append(intro)

    price = _safe_float(info.get("price"))
    high = _safe_float(info.get("fiftyTwoWeekHigh"))
    low = _safe_float(info.get("fiftyTwoWeekLow"))
    if price is not None and high is not None and low is not None and high > low:
        pos = (price - low) / (high - low) * 100
        if pos >= 85:
            paragraphs.append(
                f"Price ${price:,.2f} sits near the 52-week high (${high:,.2f}), "
                f"about {pos:.0f}% through the annual range — momentum traders often watch for breakout or fade here."
            )
        elif pos <= 15:
            paragraphs.append(
                f"Price ${price:,.2f} is near the 52-week low (${low:,.2f}), "
                f"only {pos:.0f}% above the bottom of the range — value and mean-reversion setups get attention."
            )
        else:
            paragraphs.append(
                f"Trading at ${price:,.2f}, roughly {pos:.0f}% of the way between "
                f"52-week low ${low:,.2f} and high ${high:,.2f}."
            )

    pe = _safe_float(info.get("pe"))
    if pe is not None:
        if pe > 35:
            paragraphs.append(
                f"Trailing P/E of {pe:.1f}× prices in above-average growth expectations — "
                "compare to peers and forward earnings before judging cheap vs expensive."
            )
        elif pe < 15:
            paragraphs.append(
                f"Trailing P/E of {pe:.1f}× is modest versus many large-cap tech names — "
                "confirm whether that reflects value or slower growth."
            )

    if signals:
        lead = signals[0]["text"].split("—")[0].strip()
        paragraphs.append(f"Technical snapshot: {lead}. See the Technicals tab for RSI, MACD, and stochastic detail.")

    ratios = fin.get("ratios") or []
    if ratios and ratios[0].get("debtEquity") is not None:
        de = ratios[0]["debtEquity"]
        paragraphs.append(
            f"Latest balance-sheet debt/equity is {de:.2f}× — "
            "higher leverage amplifies both earnings upside and downside risk."
        )

    if peers:
        paragraphs.append(
            f"Peer comparison includes {', '.join(peers[:4])}. "
            "Use the Valuation tab to compare multiples and rebased performance."
        )

    return paragraphs


def _series_pct_change(series: dict | None) -> float | None:
    if not series:
        return None
    values = [v for v in (series.get("values") or []) if v is not None]
    if len(values) < 2 or values[-2] == 0:
        return None
    return _safe_float((values[-1] - values[-2]) / abs(values[-2]) * 100)


def _fmt_large_usd(val: float | None) -> str:
    if val is None:
        return "—"
    abs_v = abs(val)
    if abs_v >= 1e12:
        return f"${val / 1e12:.2f}T"
    if abs_v >= 1e9:
        return f"${val / 1e9:.2f}B"
    if abs_v >= 1e6:
        return f"${val / 1e6:.1f}M"
    return f"${val:,.0f}"


def build_company_tab_commentary(
    symbol: str,
    info: dict,
    df: pd.DataFrame,
    signals: list[dict],
    fin: dict,
    peers_table: list[dict],
    peer_perf: dict,
    dividends: list[dict],
) -> dict[str, list[str]]:
    name = info.get("name") or symbol

    technicals: list[str] = []
    if df.empty or "Close" not in df.columns:
        technicals.append("Not enough price history to compute technical indicators for this range.")
    else:
        row = df.dropna(subset=["Close"]).iloc[-1]
        close = _safe_float(row.get("Close"))
        parts: list[str] = []
        if signals:
            parts.append(signals[0]["text"].split("—")[0].strip())
            if len(signals) > 1:
                parts.append(signals[1]["text"].split("—")[0].strip())
        willr = _safe_float(row.get("WILLR"))
        if willr is not None:
            if willr > -20:
                parts.append(f"Williams %R at {willr:.1f} (overbought zone above −20)")
            elif willr < -80:
                parts.append(f"Williams %R at {willr:.1f} (oversold zone below −80)")
        cci = _safe_float(row.get("CCI"))
        if cci is not None:
            if cci > 100:
                parts.append(f"CCI at {cci:.1f} — price extended above its recent average")
            elif cci < -100:
                parts.append(f"CCI at {cci:.1f} — price depressed vs its recent average")
        atr = _safe_float(row.get("ATR"))
        if atr is not None and close:
            atr_pct = atr / close * 100
            if atr_pct >= 3:
                parts.append(
                    f"ATR implies ~{atr_pct:.1f}% daily swings — elevated volatility vs calmer names"
                )
            else:
                parts.append(f"ATR implies ~{atr_pct:.1f}% typical daily range — moderate volatility")
        sma20 = _safe_float(row.get("SMA20"))
        if close is not None and sma20 is not None:
            if close > sma20 * 1.02:
                parts.append("Price trades above the 20-day average — short-term trend is up")
            elif close < sma20 * 0.98:
                parts.append("Price trades below the 20-day average — short-term trend is soft")
        if parts:
            technicals.append(
                f"Technical read for {name}: " + "; ".join(parts[:4]) + "."
            )
        else:
            technicals.append(
                "Indicators are in neutral territory — no strong overbought or oversold extremes."
            )
        technicals.append(
            "These readings describe momentum and volatility context only; "
            "combine with fundamentals and your own risk limits before acting."
        )

    financials: list[str] = []
    charts = fin.get("charts") or {}
    q = charts.get("quarterly") or {}
    a = charts.get("annual") or {}
    rev_q_chg = _series_pct_change(q.get("revenue"))
    if rev_q_chg is not None:
        direction = "rose" if rev_q_chg >= 0 else "fell"
        financials.append(
            f"Quarterly revenue {direction} {abs(rev_q_chg):.1f}% vs the prior reported quarter."
        )
    ni_q_chg = _series_pct_change(q.get("netIncome"))
    if ni_q_chg is not None:
        direction = "improved" if ni_q_chg >= 0 else "declined"
        financials.append(
            f"Quarterly net income {direction} {abs(ni_q_chg):.1f}% sequentially."
        )
    margin_vals = [v for v in (q.get("netMargin") or {}).get("values") or [] if v is not None]
    if len(margin_vals) >= 2:
        financials.append(
            f"Net margin moved from {margin_vals[-2]:.1f}% to {margin_vals[-1]:.1f}% in the latest quarter."
        )
    rev_a = a.get("revenue")
    if rev_a:
        a_vals = [v for v in rev_a.get("values") or [] if v is not None]
        if len(a_vals) >= 2 and a_vals[-2]:
            yoy = (a_vals[-1] - a_vals[-2]) / abs(a_vals[-2]) * 100
            direction = "grew" if yoy >= 0 else "shrank"
            financials.append(
                f"Annual revenue {direction} {abs(yoy):.1f}% year over year "
                f"({_fmt_large_usd(a_vals[-2])} → {_fmt_large_usd(a_vals[-1])})."
            )
    fcf_chg = _series_pct_change(q.get("freeCashFlow"))
    if fcf_chg is not None:
        tone = "stronger" if fcf_chg >= 0 else "weaker"
        financials.append(f"Free cash flow looks {tone} sequentially ({fcf_chg:+.1f}%).")
    ratios = fin.get("ratios") or []
    if ratios:
        latest = ratios[0]
        de = latest.get("debtEquity")
        cr = latest.get("currentRatio")
        bits = []
        if de is not None:
            bits.append(f"debt/equity {de:.2f}×")
        if cr is not None:
            bits.append(f"current ratio {cr:.2f}")
        if bits:
            financials.append(f"Latest balance-sheet snapshot ({latest.get('period', 'recent')}): {', '.join(bits)}.")
    if not financials:
        financials.append(
            "Financial statement data is limited for this symbol — charts and ratios may fill in after Yahoo updates filings."
        )

    valuation: list[str] = []
    pe = _safe_float(info.get("pe"))
    fpe = _safe_float(info.get("forwardPe"))
    if pe is not None:
        valuation.append(f"{name} trades at {pe:.1f}× trailing earnings.")
    if fpe is not None and pe is not None:
        if fpe < pe * 0.85:
            valuation.append(
                f"Forward P/E of {fpe:.1f}× is below trailing — analysts may expect earnings growth."
            )
        elif fpe > pe * 1.15:
            valuation.append(
                f"Forward P/E of {fpe:.1f}× exceeds trailing — consensus may embed slower near-term profits."
            )
    peer_pes = [
        _safe_float(r.get("pe"))
        for r in peers_table
        if r.get("ticker") != symbol and _safe_float(r.get("pe")) is not None
    ]
    if pe is not None and peer_pes:
        med = float(np.median(peer_pes))
        if pe > med * 1.2:
            valuation.append(
                f"Trailing P/E is above the peer median ({med:.1f}×) — market may be paying a premium for growth or quality."
            )
        elif pe < med * 0.8:
            valuation.append(
                f"Trailing P/E sits below the peer median ({med:.1f}×) — verify whether that is value or weaker growth."
            )
        else:
            valuation.append(f"Trailing P/E is near the peer median ({med:.1f}×).")
    perf_dates = peer_perf.get("dates") or []
    perf_series = peer_perf.get("series") or {}
    if perf_dates and symbol in perf_series:
        end_vals = {
            sym: vals[-1]
            for sym, vals in perf_series.items()
            if vals and vals[-1] is not None
        }
        if len(end_vals) >= 2:
            leader = max(end_vals, key=end_vals.get)
            laggard = min(end_vals, key=end_vals.get)
            valuation.append(
                f"Over the selected period, {leader} leads rebased performance "
                f"({end_vals[leader]:.1f}) vs {laggard} ({end_vals[laggard]:.1f})."
            )
    if not valuation:
        valuation.append(
            "Valuation multiples are sparse for this symbol — add peers from your watchlist for richer comparison."
        )

    dividends_tab: list[str] = []
    div_yield = _safe_float(info.get("divYield"))
    if div_yield is not None and div_yield > 0:
        dividends_tab.append(f"Indicated dividend yield is {div_yield:.2f}% based on trailing payments vs current price.")
    if dividends:
        amounts = [d["amount"] for d in dividends if d.get("amount") is not None]
        if amounts:
            recent = amounts[-4:]
            ttm = sum(recent)
            dividends_tab.append(
                f"Trailing four payments total ${ttm:.2f} per share; latest distribution was ${amounts[-1]:.2f}."
            )
            if len(amounts) >= 2:
                chg = (amounts[-1] - amounts[-2]) / amounts[-2] * 100 if amounts[-2] else None
                if chg is not None:
                    if chg > 1:
                        dividends_tab.append(
                            f"Most recent dividend is {chg:.1f}% above the prior payment — payout may be rising."
                        )
                    elif chg < -1:
                        dividends_tab.append(
                            f"Most recent dividend is {abs(chg):.1f}% below the prior payment — check for cuts or specials."
                        )
                    else:
                        dividends_tab.append("Recent dividends are stable versus the prior payment.")
        if len(amounts) >= 8:
            older_avg = sum(amounts[-8:-4]) / 4
            recent_avg = sum(amounts[-4:]) / 4
            if older_avg and recent_avg:
                growth = (recent_avg - older_avg) / older_avg * 100
                if growth > 3:
                    dividends_tab.append(
                        f"Average quarterly payout rose ~{growth:.1f}% vs the prior four quarters."
                    )
                elif growth < -3:
                    dividends_tab.append(
                        f"Average quarterly payout fell ~{abs(growth):.1f}% vs the prior four quarters."
                    )
    if not dividends_tab:
        dividends_tab.append(
            "No regular dividend history on file — common for growth companies that reinvest cash flow."
        )

    return {
        "technicals": technicals,
        "financials": financials,
        "valuation": valuation,
        "dividends": dividends_tab,
    }


def _ohlcv_json(df: pd.DataFrame, include_indicators: bool = False) -> list[dict]:
    if df is None or df.empty:
        return []
    if "Close" in df.columns:
        df = df.dropna(subset=["Close"])
    if df.empty:
        return []
    key_map = {
        "Open": "open", "High": "high", "Low": "low", "Close": "close", "Volume": "volume",
        "SMA20": "sma20", "SMA50": "sma50", "SMA200": "sma200",
        "BB_Upper": "bbUpper", "BB_Mid": "bbMid", "BB_Lower": "bbLower",
        "RSI": "rsi", "MACD": "macd", "MACD_Signal": "macdSignal",
        "MACD_Hist": "macdHist", "STOCH_K": "stochK", "STOCH_D": "stochD",
        "WILLR": "willr", "ATR": "atr", "CCI": "cci",
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


def _df_stmt_json(df: pd.DataFrame, max_cols: int | None = None) -> list[dict]:
    if df is None or df.empty:
        return []
    col_count = len(df.columns) if max_cols is None else min(max_cols, len(df.columns))
    rows = []
    for label in df.index[:24]:
        row = {"line": str(label)}
        for i, col in enumerate(df.columns[:col_count]):
            row[f"p{i}"] = _safe_float(df.loc[label, col])
            row[f"period_{i}"] = _fmt_date(col) if hasattr(col, "strftime") else str(col)[:10]
        rows.append(row)
    return rows


FIN_STMT_ALIASES: dict[str, list[str]] = {
    "revenue": ["Total Revenue", "Revenue", "Operating Revenue"],
    "netIncome": [
        "Net Income",
        "Net Income Common Stockholders",
        "Net Income From Continuing Operation Net Minority Interest",
    ],
    "grossProfit": ["Gross Profit"],
    "operatingIncome": ["Operating Income", "EBIT"],
    "operatingCashFlow": [
        "Operating Cash Flow",
        "Cash Flow From Continuing Operating Activities",
    ],
    "freeCashFlow": ["Free Cash Flow"],
}

INCOME_CHART_KEYS = ("revenue", "netIncome", "grossProfit", "operatingIncome")
CASHFLOW_CHART_KEYS = ("operatingCashFlow", "freeCashFlow")


def _extract_stmt_series(df: pd.DataFrame, labels: list[str]) -> dict | None:
    if df is None or df.empty:
        return None
    for label in labels:
        if label not in df.index:
            continue
        periods: list[str] = []
        values: list[float | None] = []
        for col in reversed(df.columns):
            val = _safe_float(df.loc[label, col])
            if val is None:
                continue
            periods.append(_fmt_date(col))
            values.append(val)
        if values:
            return {"periods": periods, "values": values, "label": label}
    return None


def _margin_series(
    numerator: dict | None,
    denominator: dict | None,
    label: str,
) -> dict | None:
    if not numerator or not denominator:
        return None
    periods = numerator.get("periods") or []
    num_vals = numerator.get("values") or []
    den_map = dict(zip(denominator.get("periods") or [], denominator.get("values") or []))
    out_periods: list[str] = []
    out_vals: list[float | None] = []
    for period, num in zip(periods, num_vals):
        den = den_map.get(period)
        if num is None or den in (None, 0):
            continue
        out_periods.append(period)
        out_vals.append(_safe_float(num / den * 100))
    if not out_vals:
        return None
    return {"periods": out_periods, "values": out_vals, "label": label}


def build_financial_charts(
    income_q: pd.DataFrame,
    income_a: pd.DataFrame,
    cashflow_q: pd.DataFrame,
    cashflow_a: pd.DataFrame,
) -> dict:
    quarterly: dict[str, dict | None] = {}
    annual: dict[str, dict | None] = {}

    for key in INCOME_CHART_KEYS:
        quarterly[key] = _extract_stmt_series(income_q, FIN_STMT_ALIASES[key])
        annual[key] = _extract_stmt_series(income_a, FIN_STMT_ALIASES[key])

    for key in CASHFLOW_CHART_KEYS:
        quarterly[key] = _extract_stmt_series(cashflow_q, FIN_STMT_ALIASES[key])
        annual[key] = _extract_stmt_series(cashflow_a, FIN_STMT_ALIASES[key])

    quarterly["netMargin"] = _margin_series(
        quarterly.get("netIncome"),
        quarterly.get("revenue"),
        "Net Margin %",
    )
    annual["netMargin"] = _margin_series(
        annual.get("netIncome"),
        annual.get("revenue"),
        "Net Margin %",
    )

    return {"quarterly": quarterly, "annual": annual}


def history_points_from_closes(close: pd.Series, days: int = 90) -> list[dict]:
    if close is None or close.empty:
        return []
    tail = close.dropna().tail(days)
    return [
        {"date": _fmt_date(d), "close": _safe_float(v)}
        for d, v in tail.items()
    ]


def _overview_row(sym: str, history: dict, labels: dict[str, str]) -> dict:
    df = history.get(sym, pd.DataFrame())
    close = df["Close"] if not df.empty and "Close" in df.columns else pd.Series(dtype=float)
    close = close.dropna()
    rets = compute_period_returns(close) if not close.empty else {}
    perf = perf_from_closes(close) or {}
    price = _safe_float(close.iloc[-1]) if not close.empty else None
    change = None
    change_pct = None
    if len(close) >= 2:
        last = _safe_float(close.iloc[-1])
        prev = _safe_float(close.iloc[-2])
        if last is not None and prev:
            change = last - prev
            change_pct = ((last / prev) - 1) * 100
    return {
        "name": labels.get(sym, sym),
        "ticker": sym,
        "price": price,
        "change": change,
        "changePct": change_pct,
        "perf": perf,
        **rets,
    }


def build_global_payload(
    symbols: list[str],
    start: str,
    end: str,
    movers_key: str = "YTD",
    hero_symbols: list[str] | None = None,
    perf_period: str = "1Y",
) -> dict:
    hero_symbols = list(hero_symbols or [])
    name_by_ticker = {v: k for k, v in INDICES.items()}
    all_syms = list(dict.fromkeys([s for s in hero_symbols + symbols if s]))
    labels = {sym: name_by_ticker.get(sym, sym) for sym in all_syms}
    history = download_history(all_syms, start, end)

    overview = [_overview_row(sym, history, labels) for sym in all_syms]

    closes = pd.DataFrame({
        s: h["Close"].dropna() for s, h in history.items() if "Close" in h.columns
    })
    closes = closes.dropna(how="all")

    performance = build_performance_series(closes, labels, perf_period)

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

    chart_order = list(dict.fromkeys([s for s in hero_symbols + symbols if s]))[:10]
    charts = []
    for sym in chart_order:
        df = history.get(sym, pd.DataFrame())
        close = df["Close"] if not df.empty and "Close" in df.columns else pd.Series(dtype=float)
        charts.append({
            "symbol": sym,
            "label": labels.get(sym, sym),
            "currency": "USD",
            "points": history_points_from_closes(close, days=90),
        })

    news_symbols = list(dict.fromkeys([s for s in hero_symbols + symbols if s]))
    news = fetch_stock_news(news_symbols)

    return {
        "section": "global",
        "start": start,
        "end": end,
        "indices": INDICES,
        "overview": overview,
        "heroes": hero_symbols,
        "charts": charts,
        "priceMode": "price",
        "performance": performance,
        "correlation": correlation,
        "volatility": volatility,
        "geo": geo,
        "movers": movers,
        "news": news,
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
    if not df.empty and "Close" in df.columns:
        df = df.dropna(subset=["Close"])
    if not df.empty:
        df = add_indicators(df)

    fin = {"income": [], "balance": [], "cashflow": [], "ratios": [], "charts": {}}
    dividends = []
    try:
        t = yf.Ticker(symbol)
        income_a = getattr(t, "income_stmt", None)
        if income_a is None or income_a.empty:
            income_a = t.financials
        income_q = getattr(t, "quarterly_income_stmt", None)
        if income_q is None or income_q.empty:
            income_q = t.quarterly_financials
        balance = t.balance_sheet
        cashflow_a = t.cashflow
        cashflow_q = t.quarterly_cashflow
        divs = t.dividends
        if income_a is not None and not income_a.empty:
            fin["income"] = _df_stmt_json(income_a)
        if balance is not None and not balance.empty:
            fin["balance"] = _df_stmt_json(balance)
            for i, col in enumerate(balance.columns):
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
        if cashflow_a is not None and not cashflow_a.empty:
            fin["cashflow"] = _df_stmt_json(cashflow_a)
        fin["charts"] = build_financial_charts(income_q, income_a, cashflow_q, cashflow_a)
        if divs is not None and not divs.empty:
            dividends = [{"date": _fmt_date(d), "amount": _safe_float(v)} for d, v in divs.items()]
    except Exception:
        pass

    price_return = None
    if not df.empty and "Close" in df.columns:
        closes = df["Close"].dropna()
        if len(closes) >= 2:
            price_return = _safe_float((closes.iloc[-1] / closes.iloc[0] - 1) * 100)

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

    company_info = {
        "name": info.get("longName") or info.get("shortName") or symbol,
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "currency": info.get("currency") or "USD",
        "exchange": info.get("exchange") or info.get("fullExchangeName"),
        "price": _safe_float(info.get("currentPrice") or info.get("regularMarketPrice")),
        "changePct": _safe_float(info.get("regularMarketChangePercent")),
        "marketCap": info.get("marketCap"),
        "pe": _safe_float(info.get("trailingPE")),
        "forwardPe": _safe_float(info.get("forwardPE")),
        "eps": _safe_float(info.get("trailingEps")),
        "divYield": _safe_float((info.get("dividendYield") or 0) * 100) if info.get("dividendYield") else None,
        "beta": _safe_float(info.get("beta")),
        "fiftyTwoWeekHigh": _safe_float(info.get("fiftyTwoWeekHigh")),
        "fiftyTwoWeekLow": _safe_float(info.get("fiftyTwoWeekLow")),
    }
    signals = interpret_signals(df)
    commentary = build_company_commentary(
        symbol, company_info, df, signals, price_return, fin, peers
    )
    tab_commentary = build_company_tab_commentary(
        symbol,
        company_info,
        df,
        signals,
        fin,
        peer_rows,
        peer_perf,
        dividends,
    )
    news = fetch_stock_news([symbol], per_symbol=12, max_total=25)

    return {
        "section": "company",
        "symbol": symbol,
        "peers": peers,
        "start": start,
        "end": end,
        "info": company_info,
        "summary": _company_summary(company_info, price_return),
        "commentary": commentary,
        "tabCommentary": tab_commentary,
        "ohlcv": _ohlcv_json(df, include_indicators=True) if not df.empty else [],
        "signals": signals,
        "financials": fin,
        "dividends": dividends,
        "priceReturn": price_return,
        "peersTable": peer_rows,
        "peerPerformance": peer_perf,
        "news": news,
        "defaultCompanies": DEFAULT_COMPANIES,
        "source": "Yahoo Finance via yfinance",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def get_equity_global_payload(
    symbols,
    start,
    end,
    movers_period="YTD",
    period_preset="1Y",
    hero_symbols=None,
    perf_period="1Y",
):
    if not start or not end:
        start, end = period_to_dates(period_preset, None, None)
    sym_list = symbols or list(INDICES.values())
    hero_list = list(hero_symbols or [])
    perf_key = normalize_perf_period(perf_period)
    key = (
        f"equity:global:{','.join(hero_list)}:{','.join(sym_list)}"
        f":{start}:{end}:{movers_period}:{perf_key}"
    )
    now = time.time()
    entry = _cache.get(key)
    if entry and now - entry["ts"] < CACHE_TTL:
        return entry["data"]
    data = build_global_payload(
        sym_list, start, end, movers_period, hero_list, perf_key
    )
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
    data["period"] = period_preset
    _cache[key] = {"ts": now, "data": data}
    return data