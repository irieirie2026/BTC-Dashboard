"""
Global Equity Insights — Streamlit dashboard for global indices and company analysis.
Data source: Yahoo Finance via yfinance (~15 min delayed). Educational use only.
Deploy: streamlit run app.py  |  Streamlit Cloud main: streamlit-app/app.py
"""

from __future__ import annotations

import io
from datetime import date, datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import streamlit as st
import yfinance as yf

try:
    import pandas_ta as ta

    HAS_PANDAS_TA = True
except ImportError:
    ta = None
    HAS_PANDAS_TA = False

# ---------------------------------------------------------------------------
# Theme & constants
# ---------------------------------------------------------------------------

COLOR_POS = "#00C853"
COLOR_NEG = "#FF1744"
CACHE_TTL = 300
PLOTLY_TEMPLATE = "plotly_dark"

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

PERIOD_PRESETS = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "YTD", "Max", "Custom"]


def inject_custom_css() -> None:
    st.markdown(
        f"""
        <style>
        .main-title {{ font-size: 2rem; font-weight: 700; margin-bottom: 0; }}
        .sub-title {{ color: #9CA3AF; font-size: 0.95rem; margin-top: 0.25rem; }}
        .pos {{ color: {COLOR_POS}; }}
        .neg {{ color: {COLOR_NEG}; }}
        div[data-testid="stMetricValue"] {{ font-variant-numeric: tabular-nums; }}
        </style>
        """,
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------


def fmt_price(v: float | None, currency: str = "USD") -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "—"
    if abs(v) >= 1000:
        return f"{currency} {v:,.2f}"
    return f"{currency} {v:.2f}"


def fmt_pct(v: float | None, digits: int = 2) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "—"
    return f"{v:+.{digits}f}%"


def fmt_large_num(v: float | None) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "—"
    for unit, div in [("T", 1e12), ("B", 1e9), ("M", 1e6), ("K", 1e3)]:
        if abs(v) >= div:
            return f"{v / div:.2f}{unit}"
    return f"{v:,.0f}"


def period_to_dates(preset: str, custom_start: date, custom_end: date) -> tuple[date, date]:
    end = date.today()
    if preset == "Custom":
        return custom_start, custom_end
    if preset == "YTD":
        return date(end.year, 1, 1), end
    if preset == "Max":
        return date(1990, 1, 1), end
    mapping = {
        "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "3Y": 365 * 3, "5Y": 365 * 5,
    }
    days = mapping.get(preset, 365)
    return end - timedelta(days=days), end


# ---------------------------------------------------------------------------
# Data fetching (@st.cache_data)
# ---------------------------------------------------------------------------


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
    needed = [c for c in ["Open", "High", "Low", "Close", "Volume"] if c in df.columns]
    return df[needed].dropna(how="all")


@st.cache_data(ttl=CACHE_TTL, show_spinner=False)
def download_history(tickers: tuple[str, ...], start: str, end: str) -> dict[str, pd.DataFrame]:
    if not tickers:
        return {}
    try:
        raw = yf.download(
            list(tickers),
            start=start,
            end=end,
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=False,
        )
    except Exception:
        return {}
    out: dict[str, pd.DataFrame] = {}
    for t in tickers:
        df = _extract_ohlcv(raw, t)
        if not df.empty:
            out[t] = df
    return out


@st.cache_data(ttl=CACHE_TTL, show_spinner=False)
def get_ticker_info(symbol: str) -> dict:
    try:
        return yf.Ticker(symbol).info or {}
    except Exception:
        return {}


@st.cache_data(ttl=CACHE_TTL, show_spinner=False)
def get_financials(symbol: str) -> dict[str, pd.DataFrame]:
    result = {
        "income": pd.DataFrame(),
        "balance": pd.DataFrame(),
        "cashflow": pd.DataFrame(),
        "dividends": pd.Series(dtype=float),
    }
    try:
        t = yf.Ticker(symbol)
        result["income"] = t.financials if t.financials is not None else pd.DataFrame()
        result["balance"] = t.balance_sheet if t.balance_sheet is not None else pd.DataFrame()
        result["cashflow"] = t.cashflow if t.cashflow is not None else pd.DataFrame()
        result["dividends"] = t.dividends if t.dividends is not None else pd.Series(dtype=float)
    except Exception:
        pass
    return result


# ---------------------------------------------------------------------------
# Analytics & indicators
# ---------------------------------------------------------------------------


def compute_period_returns(close: pd.Series, as_of: pd.Timestamp | None = None) -> dict[str, float | None]:
    if close is None or close.empty:
        return {"1D": None, "WTD": None, "MTD": None, "YTD": None, "1Y": None}
    close = close.dropna()
    if close.empty:
        return {"1D": None, "WTD": None, "MTD": None, "YTD": None, "1Y": None}

    last = close.iloc[-1]
    as_of = as_of or close.index[-1]

    def ret_at(ts: pd.Timestamp | None) -> float | None:
        if ts is None:
            return None
        subset = close[close.index <= ts]
        if subset.empty:
            return None
        base = subset.iloc[-1]
        if base == 0:
            return None
        return (last / base - 1) * 100

    d1 = ret_at(close.index[-2]) if len(close) >= 2 else None
    week_start = as_of - pd.Timedelta(days=as_of.weekday())
    month_start = as_of.replace(day=1)
    year_start = as_of.replace(month=1, day=1)
    y1_idx = close.index.searchsorted(as_of - pd.Timedelta(days=365))
    y1 = close.index[max(0, y1_idx - 1)] if y1_idx > 0 else None

    return {
        "1D": d1,
        "WTD": ret_at(week_start),
        "MTD": ret_at(month_start),
        "YTD": ret_at(year_start),
        "1Y": ret_at(y1),
    }


def rebase_to_100(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    first = df.iloc[0]
    first = first.replace(0, np.nan)
    return (df.divide(first) * 100).dropna(how="all")


def daily_returns(closes: pd.DataFrame) -> pd.DataFrame:
    return closes.pct_change().dropna(how="all")


def rolling_volatility(returns: pd.DataFrame, windows: tuple[int, ...] = (30, 60)) -> pd.DataFrame:
    out = pd.DataFrame(index=returns.index)
    for w in windows:
        out[f"{w}d"] = returns.rolling(w).std() * np.sqrt(252) * 100
    return out.dropna(how="all")


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Add SMA, Bollinger, RSI, MACD, Stochastic columns."""
    if df.empty or "Close" not in df.columns:
        return df
    out = df.copy()
    close = out["Close"]
    high = out.get("High", close)
    low = out.get("Low", close)

    if HAS_PANDAS_TA:
        out["SMA20"] = ta.sma(close, length=20)
        out["SMA50"] = ta.sma(close, length=50)
        out["SMA200"] = ta.sma(close, length=200)
        bb = ta.bbands(close, length=20, std=2)
        if bb is not None:
            out["BB_Upper"] = bb.iloc[:, 0]
            out["BB_Mid"] = bb.iloc[:, 1]
            out["BB_Lower"] = bb.iloc[:, 2]
        out["RSI"] = ta.rsi(close, length=14)
        macd = ta.macd(close, fast=12, slow=26, signal=9)
        if macd is not None:
            out["MACD"] = macd.iloc[:, 0]
            out["MACD_Hist"] = macd.iloc[:, 1]
            out["MACD_Signal"] = macd.iloc[:, 2]
        stoch = ta.stoch(high, low, close, k=14, d=3)
        if stoch is not None:
            out["STOCH_K"] = stoch.iloc[:, 0]
            out["STOCH_D"] = stoch.iloc[:, 1]
        return out

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


def interpret_signals(df: pd.DataFrame) -> list[tuple[str, str]]:
    """Return (level, message) tuples for technical interpretation cards."""
    msgs: list[tuple[str, str]] = []
    if df.empty or "Close" not in df.columns:
        return msgs
    row = df.dropna(subset=["Close"]).iloc[-1]
    rsi = row.get("RSI")
    if rsi is not None and not np.isnan(rsi):
        if rsi > 70:
            msgs.append(("warning", f"RSI overbought at {rsi:.1f} (>70)"))
        elif rsi < 30:
            msgs.append(("info", f"RSI oversold at {rsi:.1f} (<30)"))
    if all(k in row for k in ("SMA50", "SMA200")):
        s50, s200 = row["SMA50"], row["SMA200"]
        if not np.isnan(s50) and not np.isnan(s200):
            if s50 > s200:
                msgs.append(("info", "Golden cross active (SMA50 > SMA200)"))
            else:
                msgs.append(("warning", "Death cross active (SMA50 < SMA200)"))
    if "MACD" in row and "MACD_Signal" in row:
        if row["MACD"] > row["MACD_Signal"]:
            msgs.append(("info", "MACD above signal line (bullish momentum)"))
        else:
            msgs.append(("warning", "MACD below signal line (bearish momentum)"))
    return msgs


# ---------------------------------------------------------------------------
# Chart builders
# ---------------------------------------------------------------------------


def build_performance_chart(rebased: pd.DataFrame, labels: dict[str, str]) -> go.Figure:
    fig = go.Figure()
    for col in rebased.columns:
        fig.add_trace(
            go.Scatter(
                x=rebased.index,
                y=rebased[col],
                name=labels.get(col, col),
                mode="lines",
            )
        )
    fig.update_layout(
        template=PLOTLY_TEMPLATE,
        title="Normalized Performance (Rebased to 100)",
        xaxis_title="Date",
        yaxis_title="Index Level",
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
        height=480,
    )
    return fig


def build_correlation_heatmap(corr: pd.DataFrame, labels: dict[str, str]) -> go.Figure:
    display = corr.copy()
    display.index = [labels.get(i, i) for i in display.index]
    display.columns = [labels.get(c, c) for c in display.columns]
    fig = px.imshow(
        display,
        text_auto=".2f",
        color_continuous_scale="RdBu_r",
        zmin=-1,
        zmax=1,
        title="Daily Return Correlation",
    )
    fig.update_layout(template=PLOTLY_TEMPLATE, height=420)
    return fig


def build_volatility_chart(vol: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    for series_name in vol.columns:
        fig.add_trace(go.Scatter(x=vol.index, y=vol[series_name], name=series_name, mode="lines"))
    fig.update_layout(
        template=PLOTLY_TEMPLATE,
        title="Rolling Annualized Volatility (%)",
        xaxis_title="Date",
        yaxis_title="Vol %",
        height=400,
    )
    return fig


def build_geo_map(rows: list[dict]) -> go.Figure:
    if not rows:
        fig = go.Figure()
        fig.update_layout(template=PLOTLY_TEMPLATE, title="No geo data")
        return fig
    df = pd.DataFrame(rows)
    fig = px.scatter_geo(
        df,
        lat="lat",
        lon="lon",
        hover_name="name",
        color="return_pct",
        size="abs_return",
        color_continuous_scale=[COLOR_NEG, "#888888", COLOR_POS],
        color_continuous_midpoint=0,
        title="Global Index Performance Map",
    )
    fig.update_layout(template=PLOTLY_TEMPLATE, height=500)
    fig.update_geos(showcountries=True, showcoastlines=True, projection_type="natural earth")
    return fig


def build_movers_bar(df: pd.DataFrame, title: str) -> go.Figure:
    colors = [COLOR_POS if v >= 0 else COLOR_NEG for v in df["Return %"]]
    fig = go.Figure(go.Bar(x=df["Return %"], y=df["Index"], orientation="h", marker_color=colors))
    fig.update_layout(template=PLOTLY_TEMPLATE, title=title, height=max(320, len(df) * 28))
    return fig


def build_candlestick_chart(df: pd.DataFrame, symbol: str, show_bb: bool = True) -> go.Figure:
    fig = make_subplots(
        rows=2,
        cols=1,
        shared_xaxes=True,
        row_heights=[0.72, 0.28],
        vertical_spacing=0.03,
    )
    fig.add_trace(
        go.Candlestick(
            x=df.index,
            open=df["Open"],
            high=df["High"],
            low=df["Low"],
            close=df["Close"],
            name="Price",
        ),
        row=1,
        col=1,
    )
    for col, name, color in [
        ("SMA20", "SMA 20", "#38bdf8"),
        ("SMA50", "SMA 50", "#f59e0b"),
        ("SMA200", "SMA 200", "#a78bfa"),
    ]:
        if col in df.columns:
            fig.add_trace(
                go.Scatter(x=df.index, y=df[col], name=name, line=dict(width=1, color=color)),
                row=1,
                col=1,
            )
    if show_bb and "BB_Upper" in df.columns:
        fig.add_trace(
            go.Scatter(x=df.index, y=df["BB_Upper"], name="BB Upper", line=dict(width=0.5, dash="dot")),
            row=1,
            col=1,
        )
        fig.add_trace(
            go.Scatter(x=df.index, y=df["BB_Lower"], name="BB Lower", line=dict(width=0.5, dash="dot"),
                       fill="tonexty", fillcolor="rgba(125,135,153,0.12)"),
            row=1,
            col=1,
        )
    if "Volume" in df.columns:
        colors = [COLOR_POS if c >= o else COLOR_NEG for c, o in zip(df["Close"], df["Open"])]
        fig.add_trace(go.Bar(x=df.index, y=df["Volume"], name="Volume", marker_color=colors), row=2, col=1)
    fig.update_layout(
        template=PLOTLY_TEMPLATE,
        title=f"{symbol} — Price & Volume",
        xaxis_rangeslider_visible=False,
        height=560,
        legend=dict(orientation="h", y=1.08),
    )
    return fig


def build_indicator_panel(df: pd.DataFrame, show_rsi: bool, show_macd: bool, show_stoch: bool) -> go.Figure | None:
    panels = []
    if show_rsi and "RSI" in df.columns:
        panels.append(("RSI", df["RSI"], 70, 30))
    if show_macd and "MACD" in df.columns:
        panels.append(("MACD", df["MACD"], None, None))
    if show_stoch and "STOCH_K" in df.columns:
        panels.append(("Stoch %K", df["STOCH_K"], 80, 20))
    if not panels:
        return None
    fig = make_subplots(rows=len(panels), cols=1, shared_xaxes=True, vertical_spacing=0.06)
    for i, (name, series, upper, lower) in enumerate(panels, start=1):
        fig.add_trace(go.Scatter(x=df.index, y=series, name=name, mode="lines"), row=i, col=1)
        if upper is not None:
            fig.add_hline(y=upper, line_dash="dot", line_color=COLOR_NEG, row=i, col=1)
        if lower is not None:
            fig.add_hline(y=lower, line_dash="dot", line_color=COLOR_POS, row=i, col=1)
    fig.update_layout(template=PLOTLY_TEMPLATE, height=180 * len(panels), title="Technical Indicators")
    return fig


def build_financial_bar(df: pd.DataFrame, title: str) -> go.Figure:
    if df.empty:
        fig = go.Figure()
        fig.update_layout(template=PLOTLY_TEMPLATE, title=f"{title} — no data")
        return fig
    fig = go.Figure()
    for col in df.columns[:3]:
        fig.add_trace(go.Bar(name=str(col), x=df.index.astype(str), y=df[col]))
    fig.update_layout(template=PLOTLY_TEMPLATE, title=title, barmode="group", height=380)
    return fig


def build_dividend_chart(dividends: pd.Series, price: pd.Series) -> go.Figure:
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    if not dividends.empty:
        fig.add_trace(go.Bar(x=dividends.index, y=dividends.values, name="Dividend"), secondary_y=False)
    if not price.empty:
        yield_pct = (dividends.reindex(price.index).ffill() / price * 100).dropna()
        if not yield_pct.empty:
            fig.add_trace(
                go.Scatter(x=yield_pct.index, y=yield_pct, name="Trailing yield %", mode="lines"),
                secondary_y=True,
            )
    fig.update_layout(template=PLOTLY_TEMPLATE, title="Dividend History & Yield", height=400)
    return fig


def build_allocation_pie(labels: list[str], values: list[float]) -> go.Figure:
    fig = px.pie(names=labels, values=values, title="Portfolio Allocation", color_discrete_sequence=px.colors.sequential.Teal)
    fig.update_layout(template=PLOTLY_TEMPLATE, height=360)
    return fig


def build_peer_performance(rebased: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    for col in rebased.columns:
        fig.add_trace(go.Scatter(x=rebased.index, y=rebased[col], name=col, mode="lines"))
    fig.update_layout(
        template=PLOTLY_TEMPLATE,
        title="Relative Performance vs Peers (Rebased)",
        height=420,
    )
    return fig


# ---------------------------------------------------------------------------
# UI components
# ---------------------------------------------------------------------------


def export_csv_button(df: pd.DataFrame, filename: str, label: str = "Download CSV") -> None:
    st.download_button(
        label=label,
        data=df.to_csv(index=True).encode("utf-8"),
        file_name=filename,
        mime="text/csv",
    )


def build_indices_overview(
    selected_names: list[str],
    history: dict[str, pd.DataFrame],
) -> pd.DataFrame:
    rows = []
    for name in selected_names:
        ticker = INDICES[name]
        df = history.get(ticker, pd.DataFrame())
        if df.empty or "Close" not in df.columns:
            rows.append({
                "Index": name, "Ticker": ticker, "Price": None,
                "1D %": None, "WTD %": None, "MTD %": None, "YTD %": None, "1Y %": None,
                "Volume": None,
            })
            continue
        rets = compute_period_returns(df["Close"])
        vol = df["Volume"].iloc[-1] if "Volume" in df.columns else None
        rows.append({
            "Index": name,
            "Ticker": ticker,
            "Price": df["Close"].iloc[-1],
            "1D %": rets["1D"],
            "WTD %": rets["WTD"],
            "MTD %": rets["MTD"],
            "YTD %": rets["YTD"],
            "1Y %": rets["1Y"],
            "Volume": vol,
        })
    return pd.DataFrame(rows)


def render_global_markets(
    selected_names: list[str],
    start: date,
    end: date,
    period_return_key: str,
) -> None:
    tickers = tuple(INDICES[n] for n in selected_names)
    ticker_to_name = {v: k for k, v in INDICES.items()}

    with st.spinner("Loading index data from Yahoo Finance…"):
        history = download_history(tickers, str(start), str(end + timedelta(days=1)))

    if not history:
        st.error("Could not load index data. Try refreshing or reducing the selection.")
        return

    overview_df = build_indices_overview(selected_names, history)
    tab_over, tab_perf, tab_risk, tab_map, tab_mov = st.tabs(
        ["Overview", "Performance", "Risk & Correlations", "Global Map", "Movers"]
    )

    with tab_over:
        st.dataframe(
            overview_df,
            use_container_width=True,
            hide_index=True,
            column_config={
                "Price": st.column_config.NumberColumn(format="%.2f"),
                "1D %": st.column_config.NumberColumn(format="%.2f"),
                "WTD %": st.column_config.NumberColumn(format="%.2f"),
                "MTD %": st.column_config.NumberColumn(format="%.2f"),
                "YTD %": st.column_config.NumberColumn(format="%.2f"),
                "1Y %": st.column_config.NumberColumn(format="%.2f"),
                "Volume": st.column_config.NumberColumn(format="%,.0f"),
            },
        )
        export_csv_button(overview_df, "global_indices_overview.csv")

    closes = pd.DataFrame({t: h["Close"] for t, h in history.items() if "Close" in h.columns})
    closes = closes.dropna(how="all")
    labels = {t: ticker_to_name.get(t, t) for t in closes.columns}

    with tab_perf:
        if closes.empty:
            st.warning("Insufficient data for performance chart.")
        else:
            rebased = rebase_to_100(closes)
            st.plotly_chart(build_performance_chart(rebased, labels), use_container_width=True)
            if len(rebased) > 10:
                idx_range = st.slider(
                    "Chart date range",
                    0,
                    len(rebased) - 1,
                    (max(0, len(rebased) - 126), len(rebased) - 1),
                )
                trimmed = rebased.iloc[idx_range[0] : idx_range[1] + 1]
                st.plotly_chart(build_performance_chart(trimmed, labels), use_container_width=True)

    with tab_risk:
        if closes.shape[1] < 2:
            st.info("Select at least two indices for correlation analysis.")
        else:
            rets = daily_returns(closes)
            corr = rets.corr()
            st.plotly_chart(build_correlation_heatmap(corr, labels), use_container_width=True)
            vol_frames = []
            for t in closes.columns:
                v = rolling_volatility(rets[[t]])
                for c in v.columns:
                    vol_frames.append(v[[c]].rename(columns={c: f"{labels.get(t, t)} {c}"}))
            if vol_frames:
                vol_all = pd.concat(vol_frames, axis=1).dropna(how="all")
                st.plotly_chart(build_volatility_chart(vol_all), use_container_width=True)

    with tab_map:
        geo_rows = []
        col = period_return_key if period_return_key in overview_df.columns else "YTD %"
        for _, row in overview_df.iterrows():
            ticker = row["Ticker"]
            geo = INDEX_GEO.get(ticker)
            if not geo:
                continue
            ret = row[col]
            if ret is None or (isinstance(ret, float) and np.isnan(ret)):
                ret = 0.0
            geo_rows.append({
                "name": row["Index"],
                "lat": geo["lat"],
                "lon": geo["lon"],
                "country": geo["country"],
                "return_pct": ret,
                "abs_return": max(abs(ret), 0.5),
            })
        st.plotly_chart(build_geo_map(geo_rows), use_container_width=True)

    with tab_mov:
        period_col = period_return_key if period_return_key in overview_df.columns else "YTD %"
        movers = overview_df.dropna(subset=[period_col]).sort_values(period_col, ascending=False)
        if movers.empty:
            st.warning("No return data for movers chart.")
        else:
            top = movers.head(min(5, len(movers))).iloc[::-1]
            bottom = movers.tail(min(5, len(movers)))
            c1, c2 = st.columns(2)
            with c1:
                tdf = top.rename(columns={period_col: "Return %"})
                st.plotly_chart(
                    build_movers_bar(tdf[["Index", "Return %"]], f"Top performers ({period_col})"),
                    use_container_width=True,
                )
            with c2:
                bdf = bottom.rename(columns={period_col: "Return %"})
                st.plotly_chart(
                    build_movers_bar(bdf[["Index", "Return %"]], f"Bottom performers ({period_col})"),
                    use_container_width=True,
                )


def render_company_analysis(
    symbol: str,
    peers: list[str],
    start: date,
    end: date,
) -> None:
    all_tickers = tuple(dict.fromkeys([symbol] + peers))
    with st.spinner(f"Loading {symbol} and peer data…"):
        history = download_history(all_tickers, str(start), str(end + timedelta(days=1)))
        info = get_ticker_info(symbol)
        fin = get_financials(symbol)

    df = history.get(symbol, pd.DataFrame())
    if df.empty:
        st.error(f"No price history found for {symbol}. Check the ticker symbol.")
        return

    df = add_indicators(df)
    currency = info.get("currency", "USD") or "USD"

    tab_ov, tab_tech, tab_fin, tab_val, tab_div = st.tabs(
        ["Overview", "Price & Technicals", "Financials", "Valuation & Peers", "Dividends & Returns"]
    )

    with tab_ov:
        st.caption(f"**{info.get('longName') or info.get('shortName') or symbol}** · {info.get('sector', '—')} / {info.get('industry', '—')}")
        c1, c2, c3, c4 = st.columns(4)
        price = info.get("currentPrice") or info.get("regularMarketPrice") or df["Close"].iloc[-1]
        prev = info.get("previousClose") or df["Close"].iloc[-2] if len(df) >= 2 else price
        chg = ((price - prev) / prev * 100) if prev else None
        c1.metric("Price", fmt_price(price, currency), fmt_pct(chg))
        c2.metric("Market Cap", fmt_large_num(info.get("marketCap")))
        c3.metric("P/E (TTM)", f"{info.get('trailingPE', '—')}")
        c4.metric("EPS (TTM)", f"{info.get('trailingEps', '—')}")
        c5, c6, c7, c8 = st.columns(4)
        c5.metric("Div Yield", fmt_pct((info.get("dividendYield") or 0) * 100) if info.get("dividendYield") else "—")
        c6.metric("Beta", f"{info.get('beta', '—')}")
        c7.metric("52W High", fmt_price(info.get("fiftyTwoWeekHigh"), currency))
        c8.metric("52W Low", fmt_price(info.get("fiftyTwoWeekLow"), currency))

    with tab_tech:
        show_bb = st.checkbox("Bollinger Bands", value=True)
        show_rsi = st.checkbox("RSI (14)", value=True)
        show_macd = st.checkbox("MACD", value=True)
        show_stoch = st.checkbox("Stochastic", value=True)
        st.plotly_chart(build_candlestick_chart(df, symbol, show_bb), use_container_width=True)
        ind_fig = build_indicator_panel(df, show_rsi, show_macd, show_stoch)
        if ind_fig:
            st.plotly_chart(ind_fig, use_container_width=True)
        for level, msg in interpret_signals(df):
            if level == "warning":
                st.warning(msg)
            else:
                st.info(msg)

    with tab_fin:
        income = fin["income"]
        balance = fin["balance"]
        cashflow = fin["cashflow"]
        if income.empty and balance.empty and cashflow.empty:
            st.warning("Financial statements unavailable for this ticker (common for some international listings).")
        else:
            if not income.empty:
                rev_row = next((r for r in ["Total Revenue", "Revenue"] if r in income.index), None)
                ni_row = next((r for r in ["Net Income", "Net Income Common Stockholders"] if r in income.index), None)
                if rev_row:
                    rev = income.loc[rev_row].sort_index()
                    st.plotly_chart(
                        build_financial_bar(rev.to_frame("Revenue"), "Revenue Trend"),
                        use_container_width=True,
                    )
                if ni_row:
                    ni = income.loc[ni_row].sort_index()
                    st.plotly_chart(
                        build_financial_bar(ni.to_frame("Net Income"), "Net Income Trend"),
                        use_container_width=True,
                    )
            if not balance.empty:
                ratio_rows = []
                for period in balance.columns[:4]:
                    try:
                        assets = balance.loc["Total Assets", period] if "Total Assets" in balance.index else np.nan
                        debt = balance.loc["Total Debt", period] if "Total Debt" in balance.index else np.nan
                        equity = balance.loc["Stockholders Equity", period] if "Stockholders Equity" in balance.index else np.nan
                        cur_a = balance.loc["Current Assets", period] if "Current Assets" in balance.index else np.nan
                        cur_l = balance.loc["Current Liabilities", period] if "Current Liabilities" in balance.index else np.nan
                        ratio_rows.append({
                            "Period": str(period.date()) if hasattr(period, "date") else str(period),
                            "Debt/Equity": debt / equity if equity and not np.isnan(equity) else np.nan,
                            "Current Ratio": cur_a / cur_l if cur_l and not np.isnan(cur_l) else np.nan,
                        })
                    except Exception:
                        continue
                if ratio_rows:
                    st.subheader("Balance Sheet Ratios")
                    st.dataframe(pd.DataFrame(ratio_rows), use_container_width=True, hide_index=True)
            if not cashflow.empty:
                st.subheader("Cash Flow (latest periods)")
                st.dataframe(cashflow.iloc[:, :4], use_container_width=True)

    with tab_val:
        compare_syms = [symbol] + [p for p in peers if p != symbol]
        rows = []
        for sym in compare_syms:
            inf = get_ticker_info(sym) if sym != symbol else info
            rows.append({
                "Ticker": sym,
                "Market Cap": inf.get("marketCap"),
                "P/E": inf.get("trailingPE"),
                "Fwd P/E": inf.get("forwardPE"),
                "P/B": inf.get("priceToBook"),
                "EV/EBITDA": inf.get("enterpriseToEbitda"),
                "Profit Margin": (inf.get("profitMargins") or 0) * 100,
            })
        st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
        export_csv_button(pd.DataFrame(rows), f"{symbol}_peer_valuation.csv")
        peer_closes = pd.DataFrame({
            s: history[s]["Close"] for s in compare_syms if s in history and "Close" in history[s].columns
        })
        if not peer_closes.empty:
            st.plotly_chart(build_peer_performance(rebase_to_100(peer_closes)), use_container_width=True)

    with tab_div:
        divs = fin["dividends"]
        if divs.empty:
            st.info("No dividend history for this symbol.")
        else:
            st.plotly_chart(build_dividend_chart(divs, df["Close"]), use_container_width=True)
        if len(df) >= 2:
            total_ret = (df["Close"].iloc[-1] / df["Close"].iloc[0] - 1) * 100
            st.metric(f"Price return ({start} → {end})", fmt_pct(total_ret))


def render_watchlist() -> None:
    if "watchlist" not in st.session_state:
        st.session_state.watchlist = [{"ticker": "AAPL", "shares": 10.0, "cost": 150.0}]

    with st.expander("📋 My Watchlist / Portfolio", expanded=False):
        st.caption("Track holdings in USD. Cost basis used for simple P&L.")
        for i, row in enumerate(st.session_state.watchlist):
            c1, c2, c3, c4 = st.columns([2, 1, 1, 1])
            row["ticker"] = c1.text_input("Ticker", row["ticker"], key=f"wl_t_{i}").upper().strip()
            row["shares"] = c2.number_input("Shares", min_value=0.0, value=float(row["shares"]), key=f"wl_s_{i}")
            row["cost"] = c3.number_input("Cost/sh", min_value=0.0, value=float(row["cost"]), key=f"wl_c_{i}")
            if c4.button("✕", key=f"wl_rm_{i}"):
                st.session_state.watchlist.pop(i)
                st.rerun()

        if st.button("+ Add holding"):
            st.session_state.watchlist.append({"ticker": "", "shares": 0.0, "cost": 0.0})
            st.rerun()

        holdings = [h for h in st.session_state.watchlist if h["ticker"] and h["shares"] > 0]
        if not holdings:
            return

        tickers = tuple(h["ticker"] for h in holdings)
        snaps = download_history(tickers, str(date.today() - timedelta(days=5)), str(date.today() + timedelta(days=1)))
        total_value = 0.0
        total_cost = 0.0
        pie_labels, pie_vals = [], []
        table_rows = []

        for h in holdings:
            t = h["ticker"]
            df = snaps.get(t, pd.DataFrame())
            px_last = df["Close"].iloc[-1] if not df.empty and "Close" in df.columns else None
            if px_last is None:
                inf = get_ticker_info(t)
                px_last = inf.get("currentPrice") or inf.get("regularMarketPrice")
            if px_last is None:
                continue
            val = px_last * h["shares"]
            cost = h["cost"] * h["shares"]
            total_value += val
            total_cost += cost
            pie_labels.append(t)
            pie_vals.append(val)
            pnl = val - cost
            table_rows.append({
                "Ticker": t,
                "Shares": h["shares"],
                "Price": px_last,
                "Value": val,
                "Cost": cost,
                "P&L": pnl,
                "P&L %": (pnl / cost * 100) if cost else None,
            })

        if table_rows:
            st.dataframe(pd.DataFrame(table_rows), use_container_width=True, hide_index=True)
            m1, m2, m3 = st.columns(3)
            m1.metric("Portfolio Value", fmt_price(total_value))
            m2.metric("Total Cost", fmt_price(total_cost))
            m3.metric("Total P&L", fmt_price(total_value - total_cost), fmt_pct(
                ((total_value - total_cost) / total_cost * 100) if total_cost else None
            ))
            if pie_vals:
                st.plotly_chart(build_allocation_pie(pie_labels, pie_vals), use_container_width=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    st.set_page_config(
        page_title="Global Equity Insights",
        page_icon="🌍",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    inject_custom_css()

    if "last_refresh" not in st.session_state:
        st.session_state.last_refresh = datetime.now()

    st.markdown('<p class="main-title">🌍 Global Equity Insights</p>', unsafe_allow_html=True)
    st.markdown(
        '<p class="sub-title">Global equity index dashboard & company analysis · Yahoo Finance data</p>',
        unsafe_allow_html=True,
    )
    st.caption(f"Last refreshed: {st.session_state.last_refresh.strftime('%Y-%m-%d %H:%M:%S')}")

    with st.sidebar:
        st.header("Controls")
        if st.button("🔄 Refresh All Data", use_container_width=True):
            st.cache_data.clear()
            st.session_state.last_refresh = datetime.now()
            st.rerun()

        preset = st.selectbox("Period", PERIOD_PRESETS, index=3)
        use_custom = preset == "Custom"
        custom_start = st.date_input("Start", date.today() - timedelta(days=365), disabled=not use_custom)
        custom_end = st.date_input("End", date.today(), disabled=not use_custom)
        start, end = period_to_dates(preset, custom_start, custom_end)

        st.selectbox(
            "Currency preference",
            ["USD (primary)", "Local listing currency where available"],
            help="Metrics display listing currency from Yahoo where provided.",
        )
        if not HAS_PANDAS_TA:
            st.caption("pandas_ta not installed — using built-in indicator math.")

        render_watchlist()

    period_map = {"1D %": "1D %", "WTD %": "WTD %", "MTD %": "MTD %", "YTD %": "YTD %", "1Y %": "1Y %"}
    movers_period = st.sidebar.selectbox("Map/Movers period", list(period_map.keys()), index=3)

    tab_global, tab_company = st.tabs(["🌍 Global Markets", "🏢 Company Analysis"])

    with tab_global:
        default_sel = [
            "S&P 500", "Dow Jones", "Nasdaq Composite", "FTSE 100", "DAX",
            "Nikkei 225", "Hang Seng", "MSCI ACWI",
        ]
        selected = st.multiselect(
            "Select indices",
            list(INDICES.keys()),
            default=[n for n in default_sel if n in INDICES],
        )
        if not selected:
            st.info("Select at least one index to analyze.")
        else:
            render_global_markets(selected, start, end, movers_period)

    with tab_company:
        col_a, col_b = st.columns([1, 1])
        company_options = list(dict.fromkeys(DEFAULT_COMPANIES))
        pick = col_a.selectbox("Company", company_options, index=0)
        custom = col_b.text_input("Or enter custom ticker", "").upper().strip()
        symbol = custom if custom else pick

        if symbol and symbol not in company_options:
            company_options.append(symbol)

        peers = st.multiselect(
            "Peer comparison",
            [c for c in company_options if c != symbol],
            default=[p for p in ["MSFT", "GOOGL", "AMZN"] if p != symbol and p in company_options][:3],
        )
        render_company_analysis(symbol, peers, start, end)

    with st.expander("Data & Limitations"):
        st.markdown(
            """
            - **Data source:** Yahoo Finance via `yfinance` (~15 minute delay for US equities).
            - **Rate limits:** Heavy use may trigger temporary Yahoo throttling; use **Refresh** sparingly.
            - **International coverage:** Some non-US tickers have incomplete financials or delayed quotes.
            - **Disclaimer:** This app is for **informational and educational purposes only** — not investment advice.
            """
        )


if __name__ == "__main__":
    main()