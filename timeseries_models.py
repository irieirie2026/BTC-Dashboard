"""
BTC Time Series forecasting suite — Stats → Time Series.

Univariate and multivariate models for 1d / 7d / 30d price forecasts.
Pure NumPy core; optional statsmodels for ARIMA/VAR when installed.
"""

from __future__ import annotations

import math
import time
from typing import Any, Callable

import numpy as np

try:
    import statsmodels.api as sm  # type: ignore
    from statsmodels.tsa.arima.model import ARIMA  # type: ignore
    from statsmodels.tsa.api import VAR  # type: ignore
    from statsmodels.tsa.holtwinters import ExponentialSmoothing  # type: ignore
    from statsmodels.tsa.stattools import adfuller  # type: ignore
    from statsmodels.tsa.statespace.sarimax import SARIMAX  # type: ignore
    from statsmodels.tsa.statespace.structural import UnobservedComponents  # type: ignore
    from statsmodels.tsa.vector_ar.vecm import VECM  # type: ignore

    SM_AVAILABLE = True
except Exception:
    sm = None  # type: ignore
    ARIMA = None  # type: ignore
    VAR = None  # type: ignore
    ExponentialSmoothing = None  # type: ignore
    adfuller = None  # type: ignore
    SARIMAX = None  # type: ignore
    UnobservedComponents = None  # type: ignore
    VECM = None  # type: ignore
    SM_AVAILABLE = False

try:
    import yfinance as yf  # type: ignore

    YF_AVAILABLE = True
except Exception:
    yf = None  # type: ignore
    YF_AVAILABLE = False

try:
    from prophet import Prophet  # type: ignore

    PROPHET_AVAILABLE = True
except Exception:
    try:
        from fbprophet import Prophet  # type: ignore

        PROPHET_AVAILABLE = True
    except Exception:
        Prophet = None  # type: ignore
        PROPHET_AVAILABLE = False

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL = 1800
TRADING_DAYS_CRYPTO = 365.0
BT_HORIZONS = (1, 7, 30)
# Expanding-window backtest:
# - First year (or 1/3 of sample) is train-only warm-up
# - Then origins are spaced every `step` days across the rest of the sample
# - Cap keeps full suite runtime bounded (many models × re-fits per origin)
BT_MIN_TRAIN = 365
BT_TARGET_ORIGINS = 96  # aim for ~this many origins on long samples
BT_MAX_ORIGINS = 120
BT_MIN_STEP = 7  # at least weekly spacing


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _cache_get(key: str) -> dict[str, Any] | None:
    hit = _CACHE.get(key)
    if not hit:
        return None
    ts, val = hit
    if time.time() - ts > _CACHE_TTL:
        _CACHE.pop(key, None)
        return None
    return val


def _cache_set(key: str, val: dict[str, Any]) -> None:
    _CACHE[key] = (time.time(), val)


def _safe_float(x: Any) -> float | None:
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------

MODEL_CATALOG: list[dict[str, Any]] = [
    {
        "id": "naive",
        "name": "Naive (RW)",
        "family": "univariate",
        "kind": "baseline",
        "blurb": "Random walk: forecast = last close (no drift).",
        "whyBtc": "Hard benchmark for BTC; many complex models fail to beat it OOS.",
        "equation": "P̂_{t+h} = P_t",
    },
    {
        "id": "drift",
        "name": "RW + Drift",
        "family": "univariate",
        "kind": "baseline",
        "blurb": "Random walk with historical mean log-return drift.",
        "whyBtc": "Captures long-run positive drift; still ignores mean reversion.",
        "equation": "P̂_{t+h} = P_t · exp(h · μ̄)",
    },
    {
        "id": "sma20",
        "name": "SMA(20) mean-revert",
        "family": "univariate",
        "kind": "baseline",
        "blurb": "Pull log-price halfway toward 20d SMA of log price over horizon.",
        "whyBtc": "Simple technical mean-reversion prior.",
        "equation": "ℓ̂ = ℓ_t + α (SMA20 − ℓ_t)",
    },
    {
        "id": "ema12",
        "name": "EMA(12) trend",
        "family": "univariate",
        "kind": "baseline",
        "blurb": "Extrapolate recent EMA slope on log price.",
        "whyBtc": "Momentum baseline for short horizons.",
        "equation": "ℓ̂_{t+h} = EMA_t + h · ΔEMA",
    },
    {
        "id": "ar1",
        "name": "AR(1) returns",
        "family": "univariate",
        "kind": "arima",
        "blurb": "AR(1) on daily log returns; multi-step return sum → price.",
        "whyBtc": "Minimal autocorrelation model; BTC returns are near white noise.",
        "equation": "r_t = c + φ r_{t-1} + ε_t",
    },
    {
        "id": "ar2",
        "name": "AR(2) returns",
        "family": "univariate",
        "kind": "arima",
        "blurb": "AR(2) on log returns.",
        "whyBtc": "Allows slightly richer short-memory dynamics.",
        "equation": "r_t = c + φ₁ r_{t-1} + φ₂ r_{t-2} + ε_t",
    },
    {
        "id": "arma11",
        "name": "ARMA(1,1)",
        "family": "univariate",
        "kind": "arima",
        "blurb": "ARMA(1,1) on log returns (CSS / statsmodels).",
        "whyBtc": "Classic short-memory return model.",
        "equation": "r_t = c + φ r_{t-1} + θ ε_{t-1} + ε_t",
    },
    {
        "id": "arima111",
        "name": "ARIMA(1,1,1)",
        "family": "univariate",
        "kind": "arima",
        "blurb": "ARIMA on log price ≡ ARMA on first differences (returns).",
        "whyBtc": "Standard price-level ARIMA used by many desks as a baseline.",
        "equation": "Δℓ_t = c + φ Δℓ_{t-1} + θ ε_{t-1} + ε_t",
    },
    {
        "id": "arima212",
        "name": "ARIMA(2,1,2)",
        "family": "univariate",
        "kind": "arima",
        "blurb": "Richer ARIMA on log price.",
        "whyBtc": "More flexible than (1,1,1); risk of overfit on noisy crypto.",
        "equation": "Δℓ_t = c + φ₁Δℓ_{t-1}+φ₂Δℓ_{t-2}+θ₁ε_{t-1}+θ₂ε_{t-2}+ε_t",
    },
    {
        "id": "sarima_w",
        "name": "SARIMA weekly",
        "family": "univariate",
        "kind": "arima",
        "blurb": "Seasonal ARIMA with period 7 (crypto weekend effects).",
        "whyBtc": "Captures mild weekly seasonality in BTC volumes/returns.",
        "equation": "ARIMA(1,1,1)×(1,0,1)₇ on log price",
    },
    {
        "id": "holt",
        "name": "Holt linear (ETS)",
        "family": "univariate",
        "kind": "ets",
        "blurb": "Holt double exponential smoothing on log price (ETS A,A,N).",
        "whyBtc": "Smooths noise while keeping local trend for 1w–1M paths.",
        "equation": "ℓ̂_{t+h} = L_t + h · T_t",
    },
    {
        "id": "hw_add",
        "name": "Holt-Winters additive",
        "family": "univariate",
        "kind": "ets",
        "blurb": "ETS with additive weekly seasonality (period 7).",
        "whyBtc": "Useful if weekend/weekday structure is stable.",
        "equation": "ℓ̂ = L + hT + S_{t+h mod 7}",
    },
    {
        "id": "ets_aaa",
        "name": "ETS (A,A,A) weekly",
        "family": "univariate",
        "kind": "ets",
        "blurb": "Full additive error/trend/seasonal ETS on log price (statsmodels).",
        "whyBtc": "Richer seasonal ETS than Holt alone; weekly crypto seasonality.",
        "equation": "ETS(A,A,A) with m=7",
    },
    {
        "id": "theta",
        "name": "Theta method",
        "family": "univariate",
        "kind": "ets",
        "blurb": "Theta(2) combination of linear trend and SES (Makridakis).",
        "whyBtc": "Strong M3/M4 competitor; often competitive on asset prices.",
        "equation": "0.5 · (SES + linear trend)",
    },
    {
        "id": "prophet",
        "name": "Prophet",
        "family": "univariate",
        "kind": "prophet",
        "blurb": "Additive trend + weekly/yearly seasonality (Meta Prophet).",
        "whyBtc": "Handles holidays/seasonality; needs `prophet` package.",
        "equation": "y(t) = g(t) + s(t) + h(t) + ε_t",
    },
    {
        "id": "ridge_lags",
        "name": "Ridge lag regression",
        "family": "univariate",
        "kind": "ml",
        "blurb": "Ridge regression of next return on lags 1–5,7,14,21,30.",
        "whyBtc": "Regularized multi-lag predictor without deep learning.",
        "equation": "r_{t+1} = X_t β  (ridge)",
    },
    {
        "id": "arimax",
        "name": "ARIMAX (macro+chain)",
        "family": "with_exog",
        "kind": "arimax",
        "blurb": "ARMA on returns with lagged SPX, DXY, rates & on-chain exog.",
        "whyBtc": "Lets liquidity/risk and network activity shift the conditional mean.",
        "equation": "r_t = c + φr_{t-1} + θε_{t-1} + x'_{t-1}β + ε_t",
    },
    {
        "id": "ll_kalman",
        "name": "Local level (Kalman)",
        "family": "univariate",
        "kind": "statespace",
        "blurb": "State-space local level via Kalman filter (random-walk level).",
        "whyBtc": "Smooth latent log-price level; good when noise dominates.",
        "equation": "y_t = μ_t + ε_t,  μ_t = μ_{t-1} + η_t",
    },
    {
        "id": "llt_kalman",
        "name": "Local linear trend (Kalman)",
        "family": "univariate",
        "kind": "statespace",
        "blurb": "Kalman local level + stochastic slope (local linear trend).",
        "whyBtc": "Captures slowly changing BTC drift without heavy ARIMA orders.",
        "equation": "y_t=μ_t+ε; μ_t=μ_{t-1}+β_{t-1}+η; β_t=β_{t-1}+ζ",
    },
    {
        "id": "uc_cycle",
        "name": "UC + cycle (state-space)",
        "family": "univariate",
        "kind": "statespace",
        "blurb": "Unobserved components: local linear trend + stochastic cycle.",
        "whyBtc": "Separates trend from cyclical swings useful for 1w–1M.",
        "equation": "y_t = μ_t + ψ_t + ε_t (UC with cycle)",
    },
    {
        "id": "var1",
        "name": "VAR(1)",
        "family": "multivariate",
        "kind": "var",
        "blurb": "Vector autoregression order 1 on [BTC, SPX, DXY] log returns.",
        "whyBtc": "Links BTC to equity risk and dollar; useful for 1w–1M context.",
        "equation": "y_t = c + A₁ y_{t-1} + ε_t",
    },
    {
        "id": "var2",
        "name": "VAR(2)",
        "family": "multivariate",
        "kind": "var",
        "blurb": "VAR(2) on [BTC, SPX, DXY] log returns.",
        "whyBtc": "Extra lag for delayed risk-on/off transmission.",
        "equation": "y_t = c + A₁ y_{t-1} + A₂ y_{t-2} + ε_t",
    },
    {
        "id": "svar",
        "name": "SVAR (recursive)",
        "family": "multivariate",
        "kind": "var",
        "blurb": "Structural VAR via Cholesky (DXY → SPX → BTC) on VAR(1).",
        "whyBtc": "Impulse responses: how USD/equity shocks map into BTC returns.",
        "equation": "B₀ ε_t = u_t  (lower-triangular B₀⁻¹)",
    },
    {
        "id": "vecm",
        "name": "VECM (BTC–SPX)",
        "family": "multivariate",
        "kind": "vecm",
        "blurb": "Vector error-correction on log BTC & log SPX (cointegration).",
        "whyBtc": "If BTC and equities share a long-run link, VECM models the pull-back.",
        "equation": "Δy_t = αβ' y_{t-1} + Γ Δy_{t-1} + ε_t",
    },
]


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

def _as_day_str(v: Any) -> str | None:
    """Normalize Bitstamp ms timestamps or ISO strings to YYYY-MM-DD (UTC)."""
    if v is None:
        return None
    try:
        if isinstance(v, (int, float)) or (isinstance(v, str) and v.strip().isdigit()):
            ts = float(v)
            # Bitstamp / stats history store UTC day starts in milliseconds
            if ts > 1e12:
                ts /= 1000.0
            elif ts > 1e10:  # ms without full epoch width
                ts /= 1000.0
            if ts < 1e8:  # not a unix time
                return None
            return time.strftime("%Y-%m-%d", time.gmtime(ts))
        s = str(v).strip()
        if not s:
            return None
        # ISO / date-like
        if "T" in s:
            s = s.split("T", 1)[0]
        if len(s) >= 10 and s[4] == "-" and s[7] == "-":
            return s[:10]
        return None
    except (TypeError, ValueError, OSError):
        return None


def _load_btc(days: int = 3650) -> dict[str, Any]:
    from server import get_stats_btc_history_payload

    hist = get_stats_btc_history_payload(refresh=False)
    rows = hist.get("days") or []
    if len(rows) < 80:
        raise RuntimeError("Insufficient BTC history for time-series models")

    closes, dates = [], []
    for r in rows:
        if not isinstance(r, dict):
            continue
        c = r.get("close")
        if c is None:
            continue
        day = _as_day_str(r.get("date") if r.get("date") is not None else r.get("t") or r.get("time"))
        if not day:
            continue
        try:
            closes.append(float(c))
            dates.append(day)
        except (TypeError, ValueError):
            continue

    if len(closes) < 80:
        raise RuntimeError("Insufficient clean closes")

    if days and days > 0 and len(closes) > days + 1:
        closes = closes[-(days + 1) :]
        dates = dates[-(days + 1) :]

    c = np.asarray(closes, dtype=float)
    logp = np.log(np.maximum(c, 1e-12))
    rets = np.diff(logp)
    mask = np.isfinite(rets)
    rets = rets[mask]
    c = c[1:][mask]
    logp = logp[1:][mask]
    d = [dates[i + 1] for i in range(len(mask)) if mask[i]]

    return {
        "close": c,
        "logp": logp,
        "returns": rets,
        "dates": d,
        "n": int(len(c)),
        "pair": hist.get("pair") or "BTC/USD",
        "source": hist.get("source") or "stats_btc_history",
        "startDate": d[0] if d else None,
        "endDate": d[-1] if d else None,
    }


def _yf_close_map(ticker: str, start: str, end: str) -> dict[str, float]:
    """Download one ticker and return {YYYY-MM-DD: close}."""
    if not YF_AVAILABLE or yf is None:
        return {}
    # yfinance end is exclusive — pad one day
    try:
        from datetime import datetime, timedelta

        end_plus = (
            datetime.strptime(end, "%Y-%m-%d") + timedelta(days=2)
        ).strftime("%Y-%m-%d")
    except Exception:
        end_plus = end
    try:
        df = yf.download(
            ticker,
            start=start,
            end=end_plus,
            progress=False,
            auto_adjust=True,
            threads=False,
        )
    except Exception:
        return {}
    if df is None or len(df) < 5:
        return {}
    # Series or DataFrame
    try:
        if hasattr(df.columns, "levels"):
            # MultiIndex from some yfinance versions even for single ticker
            if "Close" in df.columns.get_level_values(0):
                series = df["Close"]
                if hasattr(series, "columns"):
                    series = series.iloc[:, 0]
            else:
                series = df.iloc[:, 0]
        elif "Close" in df.columns:
            series = df["Close"]
        elif "Adj Close" in df.columns:
            series = df["Adj Close"]
        else:
            series = df.iloc[:, 0]
        series = series.astype(float).dropna()
    except Exception:
        return {}
    out: dict[str, float] = {}
    for idx, val in series.items():
        try:
            if hasattr(idx, "date"):
                key = str(idx.date())
            else:
                key = _as_day_str(idx) or str(idx)[:10]
            fv = float(val)
            if math.isfinite(fv) and fv > 0:
                out[key] = fv
        except (TypeError, ValueError):
            continue
    return out


def _load_macro_aligned(btc_dates: list[str]) -> dict[str, Any] | None:
    """Align equity + dollar log returns to BTC dates (forward-fill).

    Returns dict with arrays + meta, or a dict with ok=False and error.
    """
    if len(btc_dates) < 50:
        return {"ok": False, "error": "BTC sample too short for macro alignment"}
    if not YF_AVAILABLE or yf is None:
        return {
            "ok": False,
            "error": "yfinance not installed — VAR/SVAR need SPX & DXY (pip install yfinance)",
        }

    start, end = btc_dates[0], btc_dates[-1]
    # Validate dates look like YYYY-MM-DD (guards against ms-timestamp bugs)
    if not (
        len(start) == 10
        and start[4] == "-"
        and len(end) == 10
        and end[4] == "-"
    ):
        return {
            "ok": False,
            "error": f"Invalid BTC date labels for yfinance (got {start!r} … {end!r})",
        }

    # Prefer liquid Yahoo symbols; fall back if a symbol is dead/rate-limited
    equity_tickers = ("^GSPC", "SPY")
    dollar_tickers = ("DX-Y.NYB", "DX=F", "UUP")
    spx_map: dict[str, float] = {}
    dxy_map: dict[str, float] = {}
    used_eq = used_dx = None
    errors: list[str] = []

    for t in equity_tickers:
        spx_map = _yf_close_map(t, start, end)
        if len(spx_map) >= 40:
            used_eq = t
            break
        errors.append(f"{t}: {len(spx_map)} rows")
    for t in dollar_tickers:
        dxy_map = _yf_close_map(t, start, end)
        if len(dxy_map) >= 40:
            used_dx = t
            break
        errors.append(f"{t}: {len(dxy_map)} rows")

    if not spx_map or not dxy_map:
        return {
            "ok": False,
            "error": (
                "Could not download equity/dollar series for VAR. "
                + "; ".join(errors[:6])
                + " (check network / Yahoo Finance rate limits)"
            ),
        }

    spx_px, dxy_px = [], []
    last_s, last_d = None, None
    for dt in btc_dates:
        if dt in spx_map:
            last_s = spx_map[dt]
        if dt in dxy_map:
            last_d = dxy_map[dt]
        spx_px.append(last_s if last_s is not None else np.nan)
        dxy_px.append(last_d if last_d is not None else np.nan)
    spx_a = np.asarray(spx_px, dtype=float)
    dxy_a = np.asarray(dxy_px, dtype=float)
    if np.isnan(spx_a).sum() > len(spx_a) * 0.35 or np.isnan(dxy_a).sum() > len(dxy_a) * 0.35:
        return {
            "ok": False,
            "error": "Macro series could not be aligned to BTC calendar (too many missing days)",
        }
    for arr in (spx_a, dxy_a):
        nans = ~np.isfinite(arr)
        if nans.any():
            # forward then back fill
            last = None
            for i in range(len(arr)):
                if np.isfinite(arr[i]):
                    last = arr[i]
                elif last is not None:
                    arr[i] = last
            last = None
            for i in range(len(arr) - 1, -1, -1):
                if np.isfinite(arr[i]):
                    last = arr[i]
                elif last is not None:
                    arr[i] = last
    spx_r = np.zeros(len(spx_a))
    dxy_r = np.zeros(len(dxy_a))
    spx_r[1:] = np.diff(np.log(np.maximum(spx_a, 1e-12)))
    dxy_r[1:] = np.diff(np.log(np.maximum(dxy_a, 1e-12)))

    # Rates / liquidity proxies (optional)
    tnx_map = _yf_close_map("^TNX", start, end)
    if len(tnx_map) < 40:
        tnx_map = _yf_close_map("TLT", start, end)
        used_rates = "TLT" if tnx_map else None
    else:
        used_rates = "^TNX"
    tnx_a = _ffill_to_dates(btc_dates, tnx_map) if tnx_map else np.full(len(btc_dates), np.nan)
    tnx_r = np.zeros(len(tnx_a))
    if np.isfinite(tnx_a).sum() > len(tnx_a) * 0.5:
        tnx_r[1:] = np.diff(np.log(np.maximum(np.abs(tnx_a), 1e-12)))
    else:
        tnx_r[:] = 0.0
        used_rates = None

    # On-chain / liquidity-style series (optional, best-effort)
    chain_names: list[str] = []
    chain_cols: list[np.ndarray] = []
    for metric_id, label in (
        ("hashrate_bg", "hashrate"),
        ("stablecoin_supply", "stablecoin"),
        ("etf_flow_btc", "etf_flow"),
    ):
        smap = _load_bgeometrics_map(metric_id)
        if not smap or len(smap) < 40:
            continue
        arr = _ffill_to_dates(btc_dates, smap)
        if np.isfinite(arr).sum() < len(arr) * 0.5:
            continue
        # use log-diff as growth / flow intensity
        r = np.zeros(len(arr))
        pos = np.maximum(np.abs(arr), 1e-12)
        r[1:] = np.diff(np.log(pos))
        # clip extreme ETF flow spikes
        r = np.clip(r, -0.5, 0.5)
        chain_cols.append(r)
        chain_names.append(label)

    # Exog matrix for ARIMAX: lagged SPX, DXY, rates, chain (T x k)
    exog_parts = [spx_r, dxy_r]
    exog_names = ["spx_ret", "dxy_ret"]
    if used_rates:
        exog_parts.append(tnx_r)
        exog_names.append("rates_ret")
    for name, col in zip(chain_names, chain_cols):
        exog_parts.append(col)
        exog_names.append(name)
    exog = np.column_stack(exog_parts) if exog_parts else None

    return {
        "ok": True,
        "spx_ret": spx_r,
        "dxy_ret": dxy_r,
        "spx": spx_a,
        "dxy": dxy_a,
        "spx_log": np.log(np.maximum(spx_a, 1e-12)),
        "equityTicker": used_eq,
        "dollarTicker": used_dx,
        "ratesTicker": used_rates,
        "tnx_ret": tnx_r,
        "chainNames": chain_names,
        "exog": exog,
        "exogNames": exog_names,
    }


def _ffill_to_dates(btc_dates: list[str], value_map: dict[str, float]) -> np.ndarray:
    out = []
    last = None
    for dt in btc_dates:
        if dt in value_map and math.isfinite(float(value_map[dt])):
            last = float(value_map[dt])
        out.append(last if last is not None else np.nan)
    arr = np.asarray(out, dtype=float)
    # back-fill leading nans
    last = None
    for i in range(len(arr) - 1, -1, -1):
        if np.isfinite(arr[i]):
            last = arr[i]
        elif last is not None:
            arr[i] = last
    # forward fill remaining
    last = None
    for i in range(len(arr)):
        if np.isfinite(arr[i]):
            last = arr[i]
        elif last is not None:
            arr[i] = last
    return arr


def _load_bgeometrics_map(metric_id: str) -> dict[str, float]:
    """Best-effort daily series from BGeometrics free endpoints (cached)."""
    try:
        from btc_data.fetchers import fetch_bgeometrics_series

        payload = fetch_bgeometrics_series(metric_id, refresh=False)
        series = (payload or {}).get("series") or []
        out: dict[str, float] = {}
        for pt in series:
            if not isinstance(pt, dict):
                continue
            day = _as_day_str(pt.get("date") or pt.get("t") or pt.get("time"))
            val = pt.get("value")
            if day is None or val is None:
                continue
            try:
                fv = float(val)
                if math.isfinite(fv):
                    out[day] = fv
            except (TypeError, ValueError):
                continue
        return out
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Helpers: fit / forecast primitives
# ---------------------------------------------------------------------------

def _ols(y: np.ndarray, X: np.ndarray) -> tuple[np.ndarray, float, float, float]:
    """Return beta, sigma2, aic, bic for Gaussian OLS."""
    n, k = X.shape
    try:
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    except Exception:
        beta = np.zeros(k)
    resid = y - X @ beta
    dof = max(1, n - k)
    sigma2 = float(np.sum(resid ** 2) / dof)
    sigma2 = max(sigma2, 1e-18)
    ll = float(-0.5 * n * (math.log(2 * math.pi) + math.log(sigma2) + 1.0))
    aic = float(2 * k - 2 * ll)
    bic = float(k * math.log(n) - 2 * ll)
    return beta, sigma2, aic, bic


def _ar_fit_forecast(
    rets: np.ndarray, p: int, h: int
) -> tuple[list[float], dict[str, Any]]:
    """AR(p) on returns; multi-step forecast of cumulative return over h days."""
    n = len(rets)
    if n < p + 20:
        raise ValueError("AR needs more data")
    y = rets[p:]
    X = np.column_stack([np.ones(n - p)] + [rets[p - i : n - i] for i in range(1, p + 1)])
    beta, sigma2, aic, bic = _ols(y, X)
    # multi-step mean path
    hist = list(rets[-p:].astype(float))
    path = []
    for _ in range(h):
        x = [1.0] + [hist[-i] for i in range(1, p + 1)]
        rhat = float(np.dot(beta, x))
        path.append(rhat)
        hist.append(rhat)
    cum = float(np.sum(path))
    params = [{"name": "const", "estimate": float(beta[0])}]
    for i in range(p):
        params.append({"name": f"phi{i+1}", "estimate": float(beta[i + 1])})
    meta = {
        "params": params,
        "aic": aic,
        "bic": bic,
        "sigma": math.sqrt(sigma2),
        "nParams": int(p + 1),
        "logLikelihood": float(-0.5 * len(y) * (math.log(2 * math.pi) + math.log(sigma2) + 1)),
        "engine": "numpy-ar",
    }
    return path, meta


def _arma11_numpy(rets: np.ndarray, h: int) -> tuple[list[float], dict[str, Any]]:
    """Rough ARMA(1,1) via CSS grid search."""
    n = len(rets)
    if n < 40:
        raise ValueError("ARMA needs more data")
    y = rets - np.mean(rets)
    best = None
    best_sse = 1e99
    for phi in np.linspace(-0.9, 0.9, 19):
        for theta in np.linspace(-0.9, 0.9, 19):
            e = np.zeros(n)
            sse = 0.0
            ok = True
            for t in range(1, n):
                e[t] = y[t] - phi * y[t - 1] - theta * e[t - 1]
                if not math.isfinite(e[t]) or abs(e[t]) > 1e3:
                    ok = False
                    break
                sse += e[t] ** 2
            if ok and sse < best_sse:
                best_sse = sse
                best = (phi, theta)
    if best is None:
        raise ValueError("ARMA grid failed")
    phi, theta = best
    # residual path
    e = np.zeros(n)
    for t in range(1, n):
        e[t] = y[t] - phi * y[t - 1] - theta * e[t - 1]
    mu = float(np.mean(rets))
    y_last, e_last = float(y[-1]), float(e[-1])
    path = []
    for i in range(h):
        if i == 0:
            rhat = mu + phi * y_last + theta * e_last
        else:
            # future shocks 0; y becomes previous forecast deviation
            rhat = mu + phi * (path[-1] - mu)
        path.append(float(rhat))
    sigma2 = max(best_sse / max(1, n - 3), 1e-18)
    k = 3
    ll = float(-0.5 * n * (math.log(2 * math.pi) + math.log(sigma2) + 1))
    return path, {
        "params": [
            {"name": "mu", "estimate": mu},
            {"name": "phi", "estimate": float(phi)},
            {"name": "theta", "estimate": float(theta)},
        ],
        "aic": float(2 * k - 2 * ll),
        "bic": float(k * math.log(n) - 2 * ll),
        "sigma": math.sqrt(sigma2),
        "nParams": k,
        "logLikelihood": ll,
        "engine": "numpy-arma-css",
    }


def _holt_logp(logp: np.ndarray, h: int, alpha: float = 0.3, beta: float = 0.1) -> tuple[list[float], dict]:
    n = len(logp)
    L = float(logp[0])
    T = float(logp[1] - logp[0]) if n > 1 else 0.0
    for t in range(1, n):
        prev_L = L
        L = alpha * float(logp[t]) + (1 - alpha) * (L + T)
        T = beta * (L - prev_L) + (1 - beta) * T
    path_log = [L + (i + 1) * T for i in range(h)]
    # convert to return path from last logp
    last = float(logp[-1])
    path_ret = []
    prev = last
    for lv in path_log:
        path_ret.append(float(lv - prev))
        prev = float(lv)
    return path_ret, {
        "params": [
            {"name": "alpha", "estimate": alpha},
            {"name": "beta", "estimate": beta},
            {"name": "level", "estimate": L},
            {"name": "trend", "estimate": T},
        ],
        "aic": None,
        "bic": None,
        "nParams": 2,
        "engine": "numpy-holt",
        "forecastLogp": path_log,
    }


def _theta_method(logp: np.ndarray, h: int) -> tuple[list[float], dict]:
    n = len(logp)
    t = np.arange(n, dtype=float)
    X = np.column_stack([np.ones(n), t])
    beta, _, _, _ = _ols(logp, X)
    # SES on residuals from trend
    trend = X @ beta
    resid = logp - trend
    alpha = 0.2
    s = float(resid[0])
    for r in resid[1:]:
        s = alpha * float(r) + (1 - alpha) * s
    path_log = []
    for i in range(1, h + 1):
        tt = n - 1 + i
        path_log.append(float(beta[0] + beta[1] * tt + s))
    last = float(logp[-1])
    path_ret = []
    prev = last
    for lv in path_log:
        path_ret.append(float(lv - prev))
        prev = float(lv)
    return path_ret, {
        "params": [
            {"name": "intercept", "estimate": float(beta[0])},
            {"name": "slope", "estimate": float(beta[1])},
            {"name": "ses_level", "estimate": s},
        ],
        "nParams": 3,
        "engine": "numpy-theta",
        "forecastLogp": path_log,
    }


def _ridge_lags(rets: np.ndarray, h: int, lam: float = 1.0) -> tuple[list[float], dict]:
    lags = [1, 2, 3, 4, 5, 7, 14, 21, 30]
    max_lag = max(lags)
    n = len(rets)
    if n < max_lag + 40:
        raise ValueError("Ridge needs more data")
    # y_t = f(r_{t-1}, r_{t-2}, …)
    rows, ys = [], []
    for t in range(max_lag, n):
        feat = [rets[t - L] for L in lags]
        rows.append(feat)
        ys.append(rets[t])
    X = np.asarray(rows, dtype=float)
    y = np.asarray(ys, dtype=float)
    XtX = X.T @ X + lam * np.eye(X.shape[1])
    try:
        beta = np.linalg.solve(XtX, X.T @ y)
    except Exception:
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    # multi-step: iterate with predicted returns filling lags
    hist = list(rets.astype(float))
    path = []
    for _ in range(h):
        feat = np.array([hist[-L] for L in lags], dtype=float)
        rhat = float(feat @ beta)
        path.append(rhat)
        hist.append(rhat)
    resid = y - X @ beta
    sigma2 = float(np.mean(resid ** 2)) + 1e-18
    k = len(lags)
    nobs = len(y)
    ll = float(-0.5 * nobs * (math.log(2 * math.pi) + math.log(sigma2) + 1))
    return path, {
        "params": [{"name": f"lag{L}", "estimate": float(beta[i])} for i, L in enumerate(lags)],
        "aic": float(2 * k - 2 * ll),
        "bic": float(k * math.log(nobs) - 2 * ll),
        "nParams": k,
        "logLikelihood": ll,
        "engine": "numpy-ridge",
        "lambda": lam,
    }


def _var_fit(
    Y: np.ndarray, p: int, h: int, btc_idx: int = 0
) -> tuple[list[float], dict[str, Any]]:
    """VAR(p) on multivariate returns; return BTC multi-step return path."""
    n, k = Y.shape
    if n < p + 30:
        raise ValueError("VAR needs more data")
    # Build lag matrix
    y = Y[p:]
    X_parts = [np.ones((n - p, 1))]
    for lag in range(1, p + 1):
        X_parts.append(Y[p - lag : n - lag])
    X = np.hstack(X_parts)
    # OLS equation by equation
    B = np.zeros((X.shape[1], k))
    for j in range(k):
        B[:, j], *_ = np.linalg.lstsq(X, y[:, j], rcond=None)
    resid = y - X @ B
    sigma = (resid.T @ resid) / max(1, n - p - X.shape[1])
    # multi-step
    hist = [Y[i].copy() for i in range(n - p, n)]
    path = []
    for _ in range(h):
        x = [1.0]
        for lag in range(1, p + 1):
            x.extend(hist[-lag].tolist())
        x = np.asarray(x, dtype=float)
        yhat = x @ B
        path.append(float(yhat[btc_idx]))
        hist.append(yhat)
    # AIC
    try:
        sign, logdet = np.linalg.slogdet(sigma + 1e-12 * np.eye(k))
        ll = float(-0.5 * (n - p) * (k * math.log(2 * math.pi) + logdet + k))
        nparams = X.shape[1] * k
        aic = float(2 * nparams - 2 * ll)
        bic = float(nparams * math.log(n - p) - 2 * ll)
    except Exception:
        ll, aic, bic, nparams = None, None, None, X.shape[1] * k
    return path, {
        "params": [{"name": f"B[{i},{j}]", "estimate": float(B[i, j])} for i in range(min(6, B.shape[0])) for j in range(k)],
        "aic": aic,
        "bic": bic,
        "nParams": int(nparams),
        "logLikelihood": ll,
        "engine": "numpy-var",
        "sigma": [[float(sigma[i, j]) for j in range(k)] for i in range(k)],
        "B": B.tolist(),
    }


def _svar_irf(B: np.ndarray, sigma: np.ndarray, p: int, steps: int = 15) -> list[dict]:
    """Recursive SVAR IRF from reduced-form VAR companion (simplified VAR(1) only)."""
    k = sigma.shape[0]
    try:
        # Cholesky of residual cov
        L = np.linalg.cholesky(sigma + 1e-12 * np.eye(k))
    except Exception:
        L = np.eye(k)
    # For VAR(1): y_t = c + A y_{t-1}; B matrix includes const in first row
    # Extract A from B (skip intercept)
    if B.shape[0] < 1 + k:
        return []
    A = B[1 : 1 + k, :].T  # k x k  (coefficients on lag1 for each equation)
    # Actually B columns are equations; rows are regressors: [1, y_{t-1}]
    # yhat_j = B[:, j] · x → A_j = B[1:, j] so A is (k, k) with A[i,j] = effect of y_i on eq j?
    A_mat = B[1 : 1 + k, :].T  # shape k x k: row eq, col lag variable
    names = ["BTC", "SPX", "DXY"][:k]
    irf = []
    for shock_i in range(k):
        e0 = L[:, shock_i]  # contemporaneous impact
        state = e0.copy()
        for h in range(steps):
            row = {"h": h, "shock": names[shock_i]}
            for j in range(k):
                row[names[j]] = float(state[j])
            irf.append(row)
            state = A_mat @ state
    return irf


def _statsmodels_arima_path(
    logp: np.ndarray, order: tuple[int, int, int], h: int, seasonal: tuple | None = None
) -> tuple[list[float], dict]:
    if not SM_AVAILABLE or ARIMA is None:
        raise RuntimeError("statsmodels not available")
    kwargs: dict[str, Any] = {"order": order}
    if seasonal:
        kwargs["seasonal_order"] = seasonal
    model = ARIMA(logp, **kwargs)
    res = model.fit()
    fc = res.forecast(steps=h)
    path_log = [float(x) for x in np.asarray(fc).ravel()]
    last = float(logp[-1])
    path_ret = []
    prev = last
    for lv in path_log:
        path_ret.append(float(lv - prev))
        prev = float(lv)
    params = []
    try:
        for name, val in res.params.items():
            params.append({"name": str(name), "estimate": float(val)})
    except Exception:
        pass
    return path_ret, {
        "params": params,
        "aic": float(res.aic) if hasattr(res, "aic") else None,
        "bic": float(res.bic) if hasattr(res, "bic") else None,
        "nParams": len(params),
        "logLikelihood": float(res.llf) if hasattr(res, "llf") else None,
        "engine": "statsmodels-arima",
        "forecastLogp": path_log,
    }


def _statsmodels_holt_hw(
    logp: np.ndarray, h: int, seasonal: bool
) -> tuple[list[float], dict]:
    if not SM_AVAILABLE or ExponentialSmoothing is None:
        raise RuntimeError("statsmodels not available")
    if seasonal:
        model = ExponentialSmoothing(
            logp, trend="add", seasonal="add", seasonal_periods=7
        )
    else:
        model = ExponentialSmoothing(logp, trend="add", seasonal=None)
    res = model.fit(optimized=True)
    fc = res.forecast(h)
    path_log = [float(x) for x in np.asarray(fc).ravel()]
    last = float(logp[-1])
    path_ret = []
    prev = last
    for lv in path_log:
        path_ret.append(float(lv - prev))
        prev = float(lv)
    return path_ret, {
        "params": [
            {"name": k, "estimate": float(v)}
            for k, v in (res.params.items() if hasattr(res.params, "items") else [])
        ],
        "aic": float(res.aic) if hasattr(res, "aic") else None,
        "bic": float(res.bic) if hasattr(res, "bic") else None,
        "nParams": 3 if not seasonal else 4,
        "engine": "statsmodels-ets",
        "forecastLogp": path_log,
    }


def _logp_path_to_returns(logp: np.ndarray, path_log: list[float]) -> list[float]:
    last = float(logp[-1])
    path_ret = []
    prev = last
    for lv in path_log:
        path_ret.append(float(lv - prev))
        prev = float(lv)
    return path_ret


def _arimax_path(
    rets: np.ndarray, exog: np.ndarray, h: int, names: list[str] | None = None
) -> tuple[list[float], dict]:
    """ARIMAX / SARIMAX on returns with lagged exogenous drivers."""
    n = len(rets)
    if exog is None or len(exog) < n:
        raise RuntimeError("ARIMAX needs aligned exog panel")
    X = np.asarray(exog[-n:], dtype=float)
    # lag exog one day to avoid same-day look-ahead
    Xlag = np.vstack([np.zeros((1, X.shape[1])), X[:-1]])
    if SM_AVAILABLE and SARIMAX is not None:
        try:
            model = SARIMAX(
                rets,
                order=(1, 0, 1),
                exog=Xlag,
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            res = model.fit(disp=False, maxiter=80)
            fut = np.tile(Xlag[-1], (h, 1))
            fc = res.get_forecast(steps=h, exog=fut)
            path = [float(x) for x in np.asarray(fc.predicted_mean).ravel()]
            params = []
            try:
                for name, val in res.params.items():
                    params.append({"name": str(name), "estimate": float(val)})
            except Exception:
                pass
            return path, {
                "params": params[:20],
                "aic": float(res.aic) if hasattr(res, "aic") else None,
                "bic": float(res.bic) if hasattr(res, "bic") else None,
                "nParams": len(params),
                "logLikelihood": float(res.llf) if hasattr(res, "llf") else None,
                "engine": "statsmodels-sarimax",
                "exogNames": names or [],
            }
        except Exception as exc:
            # fall through to numpy
            warn = f"SARIMAX failed ({str(exc)[:80]}); numpy ARX fallback"
    else:
        warn = "statsmodels SARIMAX unavailable — numpy ARX fallback"

    # Numpy ARX: r_t = c + φ r_{t-1} + x'_{t-1} β
    y = rets[1:]
    Xd = np.column_stack([np.ones(len(y)), rets[:-1], Xlag[1:]])
    beta, sigma2, aic, bic = _ols(y, Xd)
    path = []
    r_last = float(rets[-1])
    x_last = Xlag[-1]
    for _ in range(h):
        rhat = float(beta[0] + beta[1] * r_last + float(np.dot(beta[2:], x_last)))
        path.append(rhat)
        r_last = rhat
    params = [{"name": "const", "estimate": float(beta[0])}, {"name": "phi", "estimate": float(beta[1])}]
    for i, nm in enumerate(names or [f"x{i}" for i in range(X.shape[1])]):
        if 2 + i < len(beta):
            params.append({"name": str(nm), "estimate": float(beta[2 + i])})
    return path, {
        "params": params,
        "aic": aic,
        "bic": bic,
        "nParams": len(beta),
        "engine": "numpy-arx",
        "warning": warn,
        "exogNames": names or [],
    }


def _prophet_path(logp: np.ndarray, dates: list[str], h: int) -> tuple[list[float], dict]:
    if not PROPHET_AVAILABLE or Prophet is None:
        raise RuntimeError("prophet not installed (pip install prophet)")
    try:
        import pandas as pd
    except Exception as exc:
        raise RuntimeError(f"pandas required for Prophet: {exc}") from exc
    n = min(len(logp), len(dates))
    df = pd.DataFrame({"ds": pd.to_datetime(dates[-n:]), "y": logp[-n:]})
    m = Prophet(
        daily_seasonality=False,
        weekly_seasonality=True,
        yearly_seasonality=True,
        changepoint_prior_scale=0.05,
    )
    m.fit(df)
    future = m.make_future_dataframe(periods=h, freq="D")
    pred = m.predict(future)
    path_log = [float(x) for x in pred["yhat"].values[-h:]]
    path_ret = _logp_path_to_returns(logp, path_log)
    return path_ret, {
        "params": [{"name": "changepoints", "estimate": float(len(m.changepoints))}],
        "nParams": 3,
        "engine": "prophet",
        "forecastLogp": path_log,
        "aic": None,
        "bic": None,
    }


def _uc_kalman_path(logp: np.ndarray, h: int, kind: str) -> tuple[list[float], dict]:
    if not SM_AVAILABLE or UnobservedComponents is None:
        raise RuntimeError("statsmodels UnobservedComponents unavailable")
    if kind == "local_level":
        mod = UnobservedComponents(logp, level="local level")
    elif kind == "local_trend":
        mod = UnobservedComponents(logp, level="local linear trend")
    else:
        mod = UnobservedComponents(
            logp,
            level="local linear trend",
            cycle=True,
            damped_cycle=True,
            stochastic_cycle=True,
        )
    res = mod.fit(disp=False)
    fc = res.forecast(h)
    path_log = [float(x) for x in np.asarray(fc).ravel()]
    path_ret = _logp_path_to_returns(logp, path_log)
    params = []
    try:
        for name, val in res.params.items():
            params.append({"name": str(name), "estimate": float(val)})
    except Exception:
        pass
    return path_ret, {
        "params": params[:16],
        "aic": float(res.aic) if hasattr(res, "aic") else None,
        "bic": float(res.bic) if hasattr(res, "bic") else None,
        "nParams": len(params),
        "logLikelihood": float(res.llf) if hasattr(res, "llf") else None,
        "engine": f"statsmodels-uc-{kind}",
        "forecastLogp": path_log,
    }


def _numpy_local_level(logp: np.ndarray, h: int) -> tuple[list[float], dict]:
    """Simple Kalman local-level smoother + flat level forecast."""
    n = len(logp)
    # Q, R tuned lightly
    q, r = 1e-5, 1e-3
    mu = float(logp[0])
    p = 1.0
    for t in range(1, n):
        # predict
        p = p + q
        # update
        k = p / (p + r)
        mu = mu + k * (float(logp[t]) - mu)
        p = (1 - k) * p
    path_log = [mu] * h  # level stays put (pure local level)
    path_ret = _logp_path_to_returns(logp, path_log)
    return path_ret, {
        "params": [
            {"name": "level", "estimate": mu},
            {"name": "Q", "estimate": q},
            {"name": "R", "estimate": r},
        ],
        "nParams": 2,
        "engine": "numpy-kalman-ll",
        "forecastLogp": path_log,
        "warning": "statsmodels UC unavailable — pure NumPy local-level Kalman",
    }


def _vecm_path(
    logp_btc: np.ndarray, logp_spx: np.ndarray, h: int
) -> tuple[list[float], dict]:
    if not SM_AVAILABLE or VECM is None:
        raise RuntimeError("statsmodels VECM unavailable")
    n = min(len(logp_btc), len(logp_spx))
    endog = np.column_stack([logp_btc[-n:], logp_spx[-n:]])
    # drop non-finite
    mask = np.all(np.isfinite(endog), axis=1)
    endog = endog[mask]
    if len(endog) < 120:
        raise RuntimeError("VECM needs longer cointegrated sample")
    model = VECM(endog, k_ar_diff=1, coint_rank=1, deterministic="co")
    res = model.fit()
    # predict levels
    try:
        fc = res.predict(steps=h)
        path_log = [float(row[0]) for row in np.asarray(fc)]
    except Exception:
        # some versions use different API
        fc = res.fittedvalues  # fallback flat
        last = float(endog[-1, 0])
        path_log = [last] * h
    path_ret = _logp_path_to_returns(logp_btc, path_log)
    params = []
    try:
        alpha = np.asarray(res.alpha).ravel()
        beta = np.asarray(res.beta).ravel()
        for i, a in enumerate(alpha):
            params.append({"name": f"alpha[{i}]", "estimate": float(a)})
        for i, b in enumerate(beta):
            params.append({"name": f"beta[{i}]", "estimate": float(b)})
    except Exception:
        pass
    return path_ret, {
        "params": params,
        "nParams": len(params) or 4,
        "engine": "statsmodels-vecm",
        "forecastLogp": path_log,
        "aic": None,
        "bic": None,
    }


# ---------------------------------------------------------------------------
# Model dispatcher
# ---------------------------------------------------------------------------

def _forecast_returns_path(
    model_id: str,
    data: dict[str, Any],
    macro: dict[str, np.ndarray] | None,
    h: int,
) -> tuple[list[float], dict[str, Any]]:
    """Return length-h daily log-return forecast path + meta."""
    rets = np.asarray(data["returns"], dtype=float)
    logp = np.asarray(data["logp"], dtype=float)
    close = np.asarray(data["close"], dtype=float)
    last_p = float(close[-1])

    if model_id == "naive":
        path = [0.0] * h
        return path, {
            "params": [],
            "nParams": 0,
            "engine": "naive",
            "aic": None,
            "bic": None,
        }

    if model_id == "drift":
        mu = float(np.mean(rets))
        path = [mu] * h
        return path, {
            "params": [{"name": "mu", "estimate": mu}],
            "nParams": 1,
            "engine": "drift",
            "aic": None,
            "bic": None,
        }

    if model_id == "sma20":
        w = min(20, len(logp))
        sma = float(np.mean(logp[-w:]))
        last = float(logp[-1])
        # gradual reversion over h days
        alpha = 0.5
        target = last + alpha * (sma - last)
        step = (target - last) / h
        path = [step] * h
        return path, {
            "params": [
                {"name": "sma20", "estimate": sma},
                {"name": "alpha", "estimate": alpha},
            ],
            "nParams": 2,
            "engine": "sma-mr",
        }

    if model_id == "ema12":
        alpha = 2 / (12 + 1)
        ema = float(logp[0])
        prev = ema
        for x in logp[1:]:
            prev = ema
            ema = alpha * float(x) + (1 - alpha) * ema
        slope = ema - prev
        path = [float(slope)] * h
        return path, {
            "params": [
                {"name": "ema", "estimate": ema},
                {"name": "slope", "estimate": float(slope)},
            ],
            "nParams": 2,
            "engine": "ema-trend",
        }

    if model_id == "ar1":
        return _ar_fit_forecast(rets, 1, h)
    if model_id == "ar2":
        return _ar_fit_forecast(rets, 2, h)

    if model_id == "arma11":
        if SM_AVAILABLE:
            try:
                return _statsmodels_arima_path(rets, (1, 0, 1), h)
            except Exception:
                pass
        return _arma11_numpy(rets, h)

    if model_id == "arima111":
        if SM_AVAILABLE:
            try:
                return _statsmodels_arima_path(logp, (1, 1, 1), h)
            except Exception:
                pass
        # fallback: ARMA on returns
        return _arma11_numpy(rets, h)

    if model_id == "arima212":
        if SM_AVAILABLE:
            try:
                return _statsmodels_arima_path(logp, (2, 1, 2), h)
            except Exception:
                pass
        path, meta = _ar_fit_forecast(rets, 2, h)
        meta["warning"] = "statsmodels unavailable — AR(2) fallback for ARIMA(2,1,2)"
        meta["engine"] = "numpy-ar-fallback"
        return path, meta

    if model_id == "sarima_w":
        if SM_AVAILABLE:
            try:
                return _statsmodels_arima_path(
                    logp, (1, 1, 1), h, seasonal=(1, 0, 1, 7)
                )
            except Exception:
                pass
        path, meta = _arma11_numpy(rets, h)
        meta["warning"] = "statsmodels unavailable — ARMA(1,1) fallback for SARIMA"
        return path, meta

    if model_id == "holt":
        if SM_AVAILABLE:
            try:
                return _statsmodels_holt_hw(logp, h, seasonal=False)
            except Exception:
                pass
        return _holt_logp(logp, h)

    if model_id == "hw_add":
        if SM_AVAILABLE:
            try:
                return _statsmodels_holt_hw(logp, h, seasonal=True)
            except Exception:
                pass
        path, meta = _holt_logp(logp, h)
        meta["warning"] = "statsmodels unavailable — Holt fallback for Holt-Winters"
        return path, meta

    if model_id == "ets_aaa":
        if SM_AVAILABLE:
            try:
                return _statsmodels_holt_hw(logp, h, seasonal=True)
            except Exception:
                pass
        path, meta = _holt_logp(logp, h)
        meta["warning"] = "ETS(A,A,A) fallback to Holt (statsmodels seasonal fit failed)"
        meta["engine"] = "numpy-holt-fallback"
        return path, meta

    if model_id == "theta":
        return _theta_method(logp, h)

    if model_id == "prophet":
        dates = data.get("dates") or []
        try:
            return _prophet_path(logp, dates, h)
        except Exception as exc:
            path, meta = _holt_logp(logp, h)
            meta["warning"] = f"Prophet unavailable/failed ({str(exc)[:100]}) — Holt fallback"
            meta["engine"] = "numpy-holt-fallback"
            return path, meta

    if model_id == "ridge_lags":
        return _ridge_lags(rets, h)

    if model_id == "arimax":
        if not macro or not macro.get("ok") or macro.get("exog") is None:
            raise RuntimeError(
                (macro or {}).get("error")
                if isinstance(macro, dict)
                else "ARIMAX needs macro/on-chain exog panel"
            )
        return _arimax_path(
            rets,
            np.asarray(macro["exog"], dtype=float),
            h,
            names=list(macro.get("exogNames") or []),
        )

    if model_id == "ll_kalman":
        try:
            return _uc_kalman_path(logp, h, "local_level")
        except Exception:
            return _numpy_local_level(logp, h)

    if model_id == "llt_kalman":
        try:
            return _uc_kalman_path(logp, h, "local_trend")
        except Exception as exc:
            path, meta = _holt_logp(logp, h)
            meta["warning"] = f"Local linear trend UC failed ({str(exc)[:80]}) — Holt fallback"
            return path, meta

    if model_id == "uc_cycle":
        try:
            return _uc_kalman_path(logp, h, "cycle")
        except Exception as exc:
            path, meta = _holt_logp(logp, h)
            meta["warning"] = f"UC+cycle failed ({str(exc)[:80]}) — Holt fallback"
            return path, meta

    if model_id == "vecm":
        if not macro or not macro.get("ok") or macro.get("spx_log") is None:
            raise RuntimeError("VECM needs aligned SPX log-price series")
        return _vecm_path(logp, np.asarray(macro["spx_log"], dtype=float), h)

    if model_id in ("var1", "var2", "svar"):
        if not macro or not macro.get("ok") or macro.get("spx_ret") is None:
            err = (macro or {}).get("error") if isinstance(macro, dict) else None
            raise RuntimeError(
                err
                or "Macro series (SPX/DXY) unavailable for VAR/SVAR — need yfinance network"
            )
        spx_r = np.asarray(macro["spx_ret"], dtype=float)
        dxy_r = np.asarray(macro["dxy_ret"], dtype=float)
        n = min(len(rets), len(spx_r), len(dxy_r))
        if n < 80:
            raise RuntimeError("Aligned macro sample too short for VAR")
        Y = np.column_stack(
            [
                rets[-n:],
                spx_r[-n:],
                dxy_r[-n:],
            ]
        )
        # trim to finite
        m = np.all(np.isfinite(Y), axis=1)
        Y = Y[m]
        p = 2 if model_id == "var2" else 1
        path, meta = _var_fit(Y, p, h, btc_idx=0)
        if model_id == "svar":
            B = np.asarray(meta.get("B"))
            sig = np.asarray(meta.get("sigma"))
            if B is not None and sig is not None and B.size and sig.size:
                meta["irf"] = _svar_irf(B, sig, p, steps=15)
            meta["identification"] = "Recursive Cholesky: DXY → SPX → BTC (ordering in residual space after reordering)"
            # Re-fit with order DXY, SPX, BTC for structural story
            Ys = Y[:, [2, 1, 0]]  # DXY, SPX, BTC
            path2, meta2 = _var_fit(Ys, 1, h, btc_idx=2)
            path = path2
            meta["params"] = meta2.get("params")
            meta["aic"] = meta2.get("aic")
            meta["bic"] = meta2.get("bic")
            B2 = np.asarray(meta2.get("B"))
            sig2 = np.asarray(meta2.get("sigma"))
            if B2 is not None and sig2 is not None:
                # IRF with names DXY, SPX, BTC
                try:
                    L = np.linalg.cholesky(sig2 + 1e-12 * np.eye(3))
                    A_mat = B2[1:4, :].T
                    names = ["DXY", "SPX", "BTC"]
                    irf = []
                    for shock_i in range(3):
                        state = L[:, shock_i].copy()
                        for hh in range(15):
                            row = {"h": hh, "shock": names[shock_i]}
                            for j in range(3):
                                row[names[j]] = float(state[j])
                            irf.append(row)
                            state = A_mat @ state
                    meta["irf"] = irf
                except Exception:
                    pass
            meta["engine"] = "numpy-svar"
            meta["ordering"] = ["DXY", "SPX", "BTC"]
        return path, meta

    raise ValueError(f"Unknown model {model_id}")


def _path_to_price_forecasts(
    last_price: float,
    path: list[float],
    sigma_daily: float | None = None,
    h_max: int = 30,
) -> dict[str, Any]:
    """Cumulative returns at horizons 1,7,30 + multi-step price path and CI bands.

    Confidence bands use a random-walk forecast-error approximation:
    SE(cum ret to horizon h) ≈ σ · √h, with σ = residual daily log-return sd
    (or sample sd of returns if residual σ missing). Bands are on log-price space
    then exponentiated: S·exp(cum ± z·σ·√h). Not a formal model-based predictive
    density for every specification — a practical desk interval for charts.
    """
    out: dict[str, Any] = {}
    rets = [float(r) for r in (path or [])[:h_max]]
    if len(rets) < h_max:
        rets = rets + [0.0] * (h_max - len(rets))

    cum = 0.0
    cums: list[float] = []
    targets = {1: "forecast1d", 7: "forecast7d", 30: "forecast30d"}
    for i, r in enumerate(rets, start=1):
        cum += r
        cums.append(cum)
        if i in targets:
            out[targets[i]] = float(last_price * math.exp(cum))
            out[targets[i].replace("forecast", "return")] = float(cum)

    for h, key in targets.items():
        if key not in out:
            c = float(cums[h - 1]) if h <= len(cums) else 0.0
            out[key] = float(last_price * math.exp(c))
            out[key.replace("forecast", "return")] = c

    out["forecastPath"] = [
        float(last_price * math.exp(cums[i])) for i in range(len(cums))
    ]

    sig = (
        float(sigma_daily)
        if sigma_daily is not None and math.isfinite(float(sigma_daily))
        else None
    )
    if sig is None or sig <= 0:
        sig = 0.02  # ~38% ann. fallback if unknown
    sig = max(sig, 1e-6)
    out["forecastSigmaDaily"] = sig
    out["forecastSigmaAnn"] = float(sig * math.sqrt(TRADING_DAYS_CRYPTO))

    z80, z95 = 1.28155156554, 1.95996398454
    path_lo80: list[float] = []
    path_hi80: list[float] = []
    path_lo95: list[float] = []
    path_hi95: list[float] = []
    for i, c in enumerate(cums, start=1):
        se = sig * math.sqrt(float(i))
        path_lo80.append(float(last_price * math.exp(c - z80 * se)))
        path_hi80.append(float(last_price * math.exp(c + z80 * se)))
        path_lo95.append(float(last_price * math.exp(c - z95 * se)))
        path_hi95.append(float(last_price * math.exp(c + z95 * se)))
    out["forecastPathLo80"] = path_lo80
    out["forecastPathHi80"] = path_hi80
    out["forecastPathLo95"] = path_lo95
    out["forecastPathHi95"] = path_hi95
    out["forecastBandNote"] = (
        f"Approx. predictive bands: log-price ± z·σ·√h with σ={sig:.5f}/day "
        f"({out['forecastSigmaAnn'] * 100:.1f}% ann.); 80% and 95% (z=1.28 / 1.96). "
        "Random-walk error growth — illustrative, not model-specific dens."
    )
    for h, label in ((1, "1d"), (7, "7d"), (30, "30d")):
        if h <= len(cums):
            c = cums[h - 1]
            se = sig * math.sqrt(float(h))
            out[f"forecast{label}Lo80"] = float(last_price * math.exp(c - z80 * se))
            out[f"forecast{label}Hi80"] = float(last_price * math.exp(c + z80 * se))
            out[f"forecast{label}Lo95"] = float(last_price * math.exp(c - z95 * se))
            out[f"forecast{label}Hi95"] = float(last_price * math.exp(c + z95 * se))
    return out


# ---------------------------------------------------------------------------
# Backtest
# ---------------------------------------------------------------------------

def _backtest_origins(n: int) -> tuple[list[int], dict[str, Any]]:
    """Build expanding-window origin indices (not every day — thinned for speed)."""
    min_train = min(BT_MIN_TRAIN, max(120, n // 3))
    last_origin = n - max(BT_HORIZONS) - 1
    if last_origin <= min_train:
        return [], {
            "minTrain": min_train,
            "lastOrigin": last_origin,
            "step": None,
            "note": "sample too short after warm-up and forecast hold-out",
        }
    span = last_origin - min_train
    # Space origins so long samples get more OOS points (not a fixed 28)
    step = max(BT_MIN_STEP, int(math.ceil(span / float(BT_TARGET_ORIGINS))))
    # If that still exceeds hard cap, widen the step
    n_est = span // step + 1
    if n_est > BT_MAX_ORIGINS:
        step = max(BT_MIN_STEP, int(math.ceil(span / float(BT_MAX_ORIGINS))))
    origins = list(range(min_train, last_origin + 1, step))
    if origins[-1] != last_origin:
        origins.append(last_origin)
    # de-dupe while preserving order
    seen: set[int] = set()
    uniq: list[int] = []
    for t in origins:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq, {
        "minTrain": min_train,
        "lastOrigin": last_origin,
        "step": step,
        "span": span,
        "note": (
            f"Expanding window: warm-up {min_train}d, then one origin every {step}d "
            f"through the sample (not daily). Longer estimation ranges increase N OOS "
            f"up to ~{BT_MAX_ORIGINS}."
        ),
    }


def _backtest_model(
    model_id: str,
    data: dict[str, Any],
    macro: dict[str, np.ndarray] | None,
) -> dict[str, Any]:
    rets = np.asarray(data["returns"], dtype=float)
    close = np.asarray(data["close"], dtype=float)
    n = len(close)
    origins, origin_meta = _backtest_origins(n)
    if not origins:
        return {
            "ok": False,
            "error": origin_meta.get("note") or "sample too short for backtest",
            **origin_meta,
        }

    buckets: dict[int, list[dict]] = {h: [] for h in BT_HORIZONS}

    for t in origins:
        # slice data up to t inclusive
        sub = {
            "returns": rets[: t + 1],
            "logp": np.asarray(data["logp"][: t + 1], dtype=float),
            "close": close[: t + 1],
            "dates": data["dates"][: t + 1],
        }
        sub_macro = None
        if macro and macro.get("ok") and macro.get("spx_ret") is not None:
            sub_macro = {
                "ok": True,
                "spx_ret": macro["spx_ret"][: t + 1],
                "dxy_ret": macro["dxy_ret"][: t + 1],
                "spx_log": (macro.get("spx_log")[: t + 1] if macro.get("spx_log") is not None else None),
                "exog": (macro["exog"][: t + 1] if macro.get("exog") is not None else None),
                "exogNames": macro.get("exogNames"),
                "equityTicker": macro.get("equityTicker"),
                "dollarTicker": macro.get("dollarTicker"),
            }
        try:
            path, _meta = _forecast_returns_path(model_id, sub, sub_macro, max(BT_HORIZONS))
        except Exception:
            continue
        last_p = float(close[t])
        for h in BT_HORIZONS:
            if t + h >= n:
                continue
            pred_ret = float(np.sum(path[:h]))
            pred_px = last_p * math.exp(pred_ret)
            actual_px = float(close[t + h])
            actual_ret = float(np.log(actual_px / last_p))
            buckets[h].append(
                {
                    "pred": pred_px,
                    "actual": actual_px,
                    "predRet": pred_ret,
                    "actualRet": actual_ret,
                    "err": pred_px - actual_px,
                    "errRet": pred_ret - actual_ret,
                    "dirHit": int((pred_ret >= 0) == (actual_ret >= 0)),
                }
            )

    horizons_out: dict[str, Any] = {}
    mean_rmse_ret = []
    for h in BT_HORIZONS:
        pts = buckets[h]
        if not pts:
            horizons_out[str(h)] = {"n": 0}
            continue
        err_r = np.array([p["errRet"] for p in pts], dtype=float)
        err_p = np.array([p["err"] for p in pts], dtype=float)
        act = np.array([p["actual"] for p in pts], dtype=float)
        rmse_r = float(np.sqrt(np.mean(err_r ** 2)))
        mae_r = float(np.mean(np.abs(err_r)))
        rmse_p = float(np.sqrt(np.mean(err_p ** 2)))
        mape = float(np.mean(np.abs(err_p) / np.maximum(act, 1e-12)) * 100)
        hit = float(np.mean([p["dirHit"] for p in pts]))
        mean_rmse_ret.append(rmse_r)
        horizons_out[str(h)] = {
            "n": len(pts),
            "rmseRet": rmse_r,
            "maeRet": mae_r,
            "rmsePx": rmse_p,
            "mapePct": mape,
            "dirHitRate": hit,
        }

    return {
        "ok": True,
        "horizons": horizons_out,
        "meanRmseRet": float(np.mean(mean_rmse_ret)) if mean_rmse_ret else None,
        "nOrigins": len(origins),
        "originStepDays": origin_meta.get("step"),
        "minTrainDays": origin_meta.get("minTrain"),
        "originNote": origin_meta.get("note"),
    }


# ---------------------------------------------------------------------------
# Fit full model + residual diagnostics
# ---------------------------------------------------------------------------

def _fit_model(
    cat: dict[str, Any],
    data: dict[str, Any],
    macro: dict[str, np.ndarray] | None,
) -> dict[str, Any]:
    mid = cat["id"]
    h = 30
    path, meta = _forecast_returns_path(mid, data, macro, h)
    last_p = float(data["close"][-1])

    # In-sample 1-step residual proxy: rolling re-fit is expensive; use AR residual approx
    rets = np.asarray(data["returns"], dtype=float)
    fitted_1step = []
    try:
        # Use last-path logic: for AR-like use simple lag prediction on full sample
        if mid in ("ar1", "ar2"):
            p = 1 if mid == "ar1" else 2
            y = rets[p:]
            X = np.column_stack(
                [np.ones(len(rets) - p)] + [rets[p - i : len(rets) - i] for i in range(1, p + 1)]
            )
            beta, *_ = np.linalg.lstsq(X, y, rcond=None)
            fitted_1step = (X @ beta).tolist()
        else:
            # naive residual = demeaned returns
            mu = float(np.mean(rets))
            fitted_1step = [mu] * len(rets)
    except Exception:
        fitted_1step = [0.0] * len(rets)

    resid = []
    if fitted_1step and len(fitted_1step) <= len(rets):
        offset = len(rets) - len(fitted_1step)
        for i, f in enumerate(fitted_1step):
            resid.append(float(rets[offset + i] - f))

    # Innovation scale for forecast bands: residual sd, else sample return sd
    sigma_daily = None
    if len(resid) >= 30:
        sigma_daily = float(np.std(np.asarray(resid, dtype=float), ddof=1))
    if sigma_daily is None or not math.isfinite(sigma_daily) or sigma_daily <= 0:
        if len(rets) >= 30:
            sigma_daily = float(np.std(rets, ddof=1))
        else:
            sigma_daily = 0.02
    if meta.get("sigma") is not None:
        try:
            ms = float(meta["sigma"])
            if math.isfinite(ms) and ms > 0:
                sigma_daily = ms
        except (TypeError, ValueError):
            pass

    px = _path_to_price_forecasts(last_p, path, sigma_daily=sigma_daily, h_max=h)

    # ADF on returns (stationarity note)
    adf = None
    if SM_AVAILABLE and adfuller is not None:
        try:
            stat, pval, *_ = adfuller(rets[-min(len(rets), 1500) :], autolag="AIC")
            adf = {"stat": float(stat), "pvalue": float(pval)}
        except Exception:
            adf = None

    return {
        "ok": True,
        **meta,
        **px,
        "returnPath": path,
        "residuals": resid[-500:] if resid else [],
        "fitted1step": fitted_1step[-500:] if fitted_1step else [],
        "adf": adf,
        "lastPrice": last_p,
    }


# ---------------------------------------------------------------------------
# Suite API
# ---------------------------------------------------------------------------

def get_timeseries_suite_payload(
    *,
    days: int = 3650,
    models: list[str] | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    days = max(180, min(int(days or 3650), 8000))
    key = f"ts:suite:v7:{days}:{','.join(models or [])}"
    if not refresh:
        cached = _cache_get(key)
        if cached is not None:
            out = dict(cached)
            out["fromCache"] = True
            return out

    data = _load_btc(days)
    macro_raw = _load_macro_aligned(data["dates"])
    if isinstance(macro_raw, dict) and macro_raw.get("ok"):
        macro: dict[str, Any] = macro_raw
        macro_err = None
    else:
        macro_err = (
            (macro_raw or {}).get("error")
            if isinstance(macro_raw, dict)
            else "macro load failed"
        )
        # Keep error dict so VAR/SVAR can surface the message in model.error
        macro = (
            macro_raw
            if isinstance(macro_raw, dict)
            else {"ok": False, "error": macro_err}
        )

    catalog = MODEL_CATALOG
    if models:
        want = set(models)
        catalog = [c for c in MODEL_CATALOG if c["id"] in want] or MODEL_CATALOG

    results = []
    for cat in catalog:
        fit: dict[str, Any]
        try:
            fit = _fit_model(cat, data, macro)
        except Exception as exc:
            fit = {"ok": False, "error": str(exc)[:240]}

        bt: dict[str, Any] = {"ok": False}
        if fit.get("ok"):
            try:
                bt = _backtest_model(cat["id"], data, macro)
            except Exception as exc:
                bt = {"ok": False, "error": str(exc)[:160]}

        row = {
            "id": cat["id"],
            "name": cat["name"],
            "family": cat["family"],
            "kind": cat["kind"],
            "blurb": cat["blurb"],
            "whyBtc": cat["whyBtc"],
            "equation": cat.get("equation"),
            "status": "ok" if fit.get("ok") else "failed",
            "error": fit.get("error"),
            "warning": fit.get("warning"),
            "engine": fit.get("engine"),
            "aic": fit.get("aic"),
            "bic": fit.get("bic"),
            "nParams": fit.get("nParams"),
            "logLikelihood": fit.get("logLikelihood"),
            "forecast1d": fit.get("forecast1d"),
            "forecast7d": fit.get("forecast7d"),
            "forecast30d": fit.get("forecast30d"),
            "return1d": fit.get("return1d"),
            "return7d": fit.get("return7d"),
            "return30d": fit.get("return30d"),
            "lastPrice": fit.get("lastPrice") or float(data["close"][-1]),
            "backtest": {
                "ok": bt.get("ok"),
                "meanRmseRet": bt.get("meanRmseRet"),
                "nOrigins": bt.get("nOrigins"),
                "originStepDays": bt.get("originStepDays"),
                "minTrainDays": bt.get("minTrainDays"),
                "originNote": bt.get("originNote"),
                "horizons": bt.get("horizons") or {},
            }
            if bt
            else None,
            "params": fit.get("params") or [],
            "irf": fit.get("irf"),
            "ordering": fit.get("ordering"),
            "identification": fit.get("identification"),
            "forecastPath": fit.get("forecastPath") or [],
            "forecastPathLo80": fit.get("forecastPathLo80") or [],
            "forecastPathHi80": fit.get("forecastPathHi80") or [],
            "forecastPathLo95": fit.get("forecastPathLo95") or [],
            "forecastPathHi95": fit.get("forecastPathHi95") or [],
            "forecastSigmaDaily": fit.get("forecastSigmaDaily"),
            "forecastSigmaAnn": fit.get("forecastSigmaAnn"),
            "forecastBandNote": fit.get("forecastBandNote"),
            "forecast1dLo80": fit.get("forecast1dLo80"),
            "forecast1dHi80": fit.get("forecast1dHi80"),
            "forecast1dLo95": fit.get("forecast1dLo95"),
            "forecast1dHi95": fit.get("forecast1dHi95"),
            "forecast7dLo80": fit.get("forecast7dLo80"),
            "forecast7dHi80": fit.get("forecast7dHi80"),
            "forecast7dLo95": fit.get("forecast7dLo95"),
            "forecast7dHi95": fit.get("forecast7dHi95"),
            "forecast30dLo80": fit.get("forecast30dLo80"),
            "forecast30dHi80": fit.get("forecast30dHi80"),
            "forecast30dLo95": fit.get("forecast30dLo95"),
            "forecast30dHi95": fit.get("forecast30dHi95"),
            "residuals": fit.get("residuals") or [],
            "adf": fit.get("adf"),
        }
        results.append(row)

    ok_rows = [r for r in results if r["status"] == "ok"]

    def _best_by(metric_fn: Callable[[dict], float | None], lower: bool = True):
        scored = []
        for r in ok_rows:
            v = metric_fn(r)
            if v is not None and math.isfinite(v):
                scored.append((v, r))
        if not scored:
            return None
        scored.sort(key=lambda x: x[0], reverse=not lower)
        return scored[0][1]

    def _h_metric(r: dict, h: int, key: str) -> float | None:
        v = (r.get("backtest") or {}).get("horizons", {}).get(str(h), {}).get(key)
        if v is None:
            return None
        try:
            fv = float(v)
        except (TypeError, ValueError):
            return None
        return fv if math.isfinite(fv) else None

    best_rmse1 = _best_by(lambda r: _h_metric(r, 1, "rmseRet"))
    best_rmse7 = _best_by(lambda r: _h_metric(r, 7, "rmseRet"))
    best_rmse30 = _best_by(lambda r: _h_metric(r, 30, "rmseRet"))
    best_mae1 = _best_by(lambda r: _h_metric(r, 1, "maeRet"))
    best_mae7 = _best_by(lambda r: _h_metric(r, 7, "maeRet"))
    best_mae30 = _best_by(lambda r: _h_metric(r, 30, "maeRet"))
    best_mape1 = _best_by(lambda r: _h_metric(r, 1, "mapePct"))
    best_mape7 = _best_by(lambda r: _h_metric(r, 7, "mapePct"))
    best_mape30 = _best_by(lambda r: _h_metric(r, 30, "mapePct"))
    best_hit1 = _best_by(lambda r: _h_metric(r, 1, "dirHitRate"), lower=False)
    best_hit7 = _best_by(lambda r: _h_metric(r, 7, "dirHitRate"), lower=False)
    best_hit30 = _best_by(lambda r: _h_metric(r, 30, "dirHitRate"), lower=False)
    best_aic = _best_by(lambda r: r.get("aic") if r.get("aic") is not None else None)
    best_bic = _best_by(lambda r: r.get("bic") if r.get("bic") is not None else None)

    # Desk mark: directional hit primary (7d), with RMSE/MAE/AIC/BIC tie-breaks
    def _pick_primary() -> tuple[dict | None, list[str]]:
        reasons: list[str] = []
        scored: list[tuple[tuple, dict]] = []
        for r in ok_rows:
            hit7 = _h_metric(r, 7, "dirHitRate")
            hit1 = _h_metric(r, 1, "dirHitRate")
            hit30 = _h_metric(r, 30, "dirHitRate")
            rmse7 = _h_metric(r, 7, "rmseRet")
            mae7 = _h_metric(r, 7, "maeRet")
            aic = r.get("aic")
            bic = r.get("bic")
            if hit7 is None and hit1 is None and hit30 is None:
                continue
            # Sort key: higher hit7, then hit1, hit30; lower rmse/mae/aic/bic
            key = (
                -(hit7 if hit7 is not None else -1.0),
                -(hit1 if hit1 is not None else -1.0),
                -(hit30 if hit30 is not None else -1.0),
                rmse7 if rmse7 is not None else 1e9,
                mae7 if mae7 is not None else 1e9,
                float(aic) if aic is not None and math.isfinite(float(aic)) else 1e18,
                float(bic) if bic is not None and math.isfinite(float(bic)) else 1e18,
            )
            scored.append((key, r))
        if not scored:
            fallback = best_rmse7 or best_aic or (ok_rows[0] if ok_rows else None)
            if fallback:
                reasons.append(
                    "No usable directional hit rates — fell back to lowest 7d RMSE / AIC."
                )
            return fallback, reasons
        scored.sort(key=lambda x: x[0])
        pick = scored[0][1]
        hit7 = _h_metric(pick, 7, "dirHitRate")
        hit1 = _h_metric(pick, 1, "dirHitRate")
        hit30 = _h_metric(pick, 30, "dirHitRate")
        rmse7 = _h_metric(pick, 7, "rmseRet")
        mae7 = _h_metric(pick, 7, "maeRet")
        n7 = (pick.get("backtest") or {}).get("horizons", {}).get("7", {}).get("n")
        if hit7 is not None:
            reasons.append(
                "Primary criterion: highest expanding-window OOS directional hit rate "
                f"at 7d ({(hit7 * 100):.1f}% of origins correct on sign)"
                + (f", N={n7} origins." if n7 is not None else ".")
            )
        else:
            reasons.append(
                "Primary criterion: best available directional hit rates "
                "(7d hit missing for peers — used 1d/30d and error metrics)."
            )
        if hit1 is not None:
            reasons.append(f"Also checked 1d hit: {(hit1 * 100):.1f}%.")
        if hit30 is not None:
            reasons.append(f"Also checked 30d hit: {(hit30 * 100):.1f}%.")
        # Tie-break transparency
        same_hit = [
            r
            for _, r in scored
            if hit7 is not None
            and _h_metric(r, 7, "dirHitRate") is not None
            and abs((_h_metric(r, 7, "dirHitRate") or 0) - hit7) < 1e-12
        ]
        if hit7 is not None and len(same_hit) > 1:
            reasons.append(
                f"{len(same_hit)} models tied on 7d hit — broke ties with lower 7d RMSE, "
                "then MAE, then AIC, then BIC."
            )
        if rmse7 is not None:
            reasons.append(f"7d OOS RMSE (log return) for this model: {rmse7:.4f}.")
        if mae7 is not None:
            reasons.append(f"7d OOS MAE (log return): {mae7:.4f}.")
        if pick.get("aic") is not None:
            reasons.append(
                f"In-sample AIC: {float(pick['aic']):.1f}"
                + (" (suite AIC leader)." if best_aic and pick["id"] == best_aic["id"] else ".")
            )
        if pick.get("bic") is not None:
            reasons.append(
                f"In-sample BIC: {float(pick['bic']):.1f}"
                + (" (suite BIC leader)." if best_bic and pick["id"] == best_bic["id"] else ".")
            )
        # Criterion badges this model earns
        badges: list[str] = []
        if best_hit1 and pick["id"] == best_hit1["id"]:
            badges.append("HIT1")
        if best_hit7 and pick["id"] == best_hit7["id"]:
            badges.append("HIT7")
        if best_hit30 and pick["id"] == best_hit30["id"]:
            badges.append("HIT30")
        if best_rmse7 and pick["id"] == best_rmse7["id"]:
            badges.append("RMSE7")
        if best_mae7 and pick["id"] == best_mae7["id"]:
            badges.append("MAE7")
        if best_aic and pick["id"] == best_aic["id"]:
            badges.append("AIC")
        if best_bic and pick["id"] == best_bic["id"]:
            badges.append("BIC")
        if badges:
            reasons.append("Criterion badges on the selected model: " + ", ".join(badges) + ".")
        # vs Naive
        naive = next((r for r in ok_rows if r.get("id") == "naive"), None)
        if naive and hit7 is not None:
            n_hit = _h_metric(naive, 7, "dirHitRate")
            n_rmse = _h_metric(naive, 7, "rmseRet")
            if n_hit is not None:
                if hit7 > n_hit + 1e-9:
                    reasons.append(
                        f"Beats Naive (RW) on 7d hit: {(hit7 * 100):.1f}% vs {(n_hit * 100):.1f}%."
                    )
                elif abs(hit7 - n_hit) < 1e-9:
                    reasons.append(
                        f"Matches Naive on 7d hit ({(hit7 * 100):.1f}%) — no directional edge vs RW."
                    )
                else:
                    reasons.append(
                        f"Below Naive on 7d hit: {(hit7 * 100):.1f}% vs {(n_hit * 100):.1f}% — "
                        "treat directional calls with caution."
                    )
            if n_rmse is not None and rmse7 is not None:
                if rmse7 < n_rmse * 0.98:
                    reasons.append(
                        f"Also beats Naive on 7d RMSE ({rmse7:.4f} vs {n_rmse:.4f})."
                    )
                else:
                    reasons.append(
                        f"Does not clearly beat Naive on 7d RMSE ({rmse7:.4f} vs {n_rmse:.4f})."
                    )
        if hit7 is not None and hit7 < 0.52:
            reasons.append(
                "Caveat: 7d hit is near coin-flip (<52%). Selection is still the least-bad "
                "among peers, not a tradable edge by itself."
            )
        elif hit7 is not None and hit7 >= 0.56:
            reasons.append(
                "7d hit ≥56% is above typical noise for this suite — still validate live before sizing."
            )
        reasons.append(
            "In-sample AIC/BIC rank fit quality and parsimony only; they do not override OOS hit. "
            "Use them as secondary badges when hit rates tie or to flag overfit-heavy specs."
        )
        return pick, reasons

    detail_row, selection_reasons = _pick_primary()
    selection_badges: list[str] = []
    if detail_row:
        for bid, label in (
            (best_hit1, "HIT1"),
            (best_hit7, "HIT7"),
            (best_hit30, "HIT30"),
            (best_rmse1, "RMSE1"),
            (best_rmse7, "RMSE7"),
            (best_rmse30, "RMSE30"),
            (best_mae7, "MAE7"),
            (best_aic, "AIC"),
            (best_bic, "BIC"),
        ):
            if bid and detail_row["id"] == bid["id"]:
                selection_badges.append(label)

    # ADF on full returns for suite
    suite_adf = None
    if SM_AVAILABLE and adfuller is not None:
        try:
            st, pv, *_ = adfuller(data["returns"][-min(1500, len(data["returns"])) :], autolag="AIC")
            suite_adf = {"stat": float(st), "pvalue": float(pv)}
        except Exception:
            suite_adf = None

    n = data["n"]
    step = max(1, n // 900)
    series = {
        "dates": data["dates"][::step],
        "close": data["close"][::step].tolist(),
        "returns": data["returns"][::step].tolist(),
    }

    payload = {
        "asOf": _now_iso(),
        "pair": data["pair"],
        "source": data["source"],
        "startDate": data["startDate"],
        "endDate": data["endDate"],
        "nObs": data["n"],
        "daysRequested": days,
        "lastPrice": float(data["close"][-1]),
        "statsmodelsAvailable": SM_AVAILABLE,
        "yfinanceAvailable": YF_AVAILABLE,
        "macroAvailable": bool(isinstance(macro, dict) and macro.get("ok")),
        "macroError": macro_err,
        "prophetAvailable": PROPHET_AVAILABLE,
        "macroNote": (
            (
                f"Macro/exog: equity {macro.get('equityTicker')}, dollar {macro.get('dollarTicker')}"
                + (f", rates {macro.get('ratesTicker')}" if macro.get("ratesTicker") else "")
                + (
                    f", chain {','.join(macro.get('chainNames') or [])}"
                    if macro.get("chainNames")
                    else ", chain n/a"
                )
                + f". ARIMAX exog: {', '.join(macro.get('exogNames') or [])}."
            )
            if isinstance(macro, dict) and macro.get("ok")
            else (
                f"Macro/exog unavailable — VAR/ARIMAX/VECM limited. {macro_err or ''}".strip()
            )
        ),
        "adfReturns": suite_adf,
        "models": results,
        "bestByRmse1d": best_rmse1["id"] if best_rmse1 else None,
        "bestByRmse7d": best_rmse7["id"] if best_rmse7 else None,
        "bestByRmse30d": best_rmse30["id"] if best_rmse30 else None,
        "bestByMae1d": best_mae1["id"] if best_mae1 else None,
        "bestByMae7d": best_mae7["id"] if best_mae7 else None,
        "bestByMae30d": best_mae30["id"] if best_mae30 else None,
        "bestByMape1d": best_mape1["id"] if best_mape1 else None,
        "bestByMape7d": best_mape7["id"] if best_mape7 else None,
        "bestByMape30d": best_mape30["id"] if best_mape30 else None,
        "bestByHit1d": best_hit1["id"] if best_hit1 else None,
        "bestByHit7d": best_hit7["id"] if best_hit7 else None,
        "bestByHit30d": best_hit30["id"] if best_hit30 else None,
        "bestByAic": best_aic["id"] if best_aic else None,
        "bestByBic": best_bic["id"] if best_bic else None,
        "selection": {
            "primaryCriterion": "dirHitRate",
            "primaryHorizon": 7,
            "rule": (
                "Maximize OOS directional hit rate at 7d; break ties with 1d/30d hit, "
                "then lower 7d RMSE, MAE, AIC, BIC."
            ),
            "selectedId": detail_row["id"] if detail_row else None,
            "selectedName": detail_row["name"] if detail_row else None,
            "reasons": selection_reasons,
            "badges": selection_badges,
            "metrics": {
                "hit1": _h_metric(detail_row, 1, "dirHitRate") if detail_row else None,
                "hit7": _h_metric(detail_row, 7, "dirHitRate") if detail_row else None,
                "hit30": _h_metric(detail_row, 30, "dirHitRate") if detail_row else None,
                "rmse7": _h_metric(detail_row, 7, "rmseRet") if detail_row else None,
                "mae7": _h_metric(detail_row, 7, "maeRet") if detail_row else None,
                "aic": detail_row.get("aic") if detail_row else None,
                "bic": detail_row.get("bic") if detail_row else None,
            },
            "leaders": {
                "hit1": best_hit1["name"] if best_hit1 else None,
                "hit7": best_hit7["name"] if best_hit7 else None,
                "hit30": best_hit30["name"] if best_hit30 else None,
                "rmse1": best_rmse1["name"] if best_rmse1 else None,
                "rmse7": best_rmse7["name"] if best_rmse7 else None,
                "rmse30": best_rmse30["name"] if best_rmse30 else None,
                "mae7": best_mae7["name"] if best_mae7 else None,
                "aic": best_aic["name"] if best_aic else None,
                "bic": best_bic["name"] if best_bic else None,
            },
        },
        "summary": {
            "lastPrice": float(data["close"][-1]),
            "bestModelName": detail_row["name"] if detail_row else None,
            "bestModelId": detail_row["id"] if detail_row else None,
            "selectionRule": "dirHitRate@7d (+ RMSE/MAE/AIC/BIC ties)",
            "forecast1d": detail_row.get("forecast1d") if detail_row else None,
            "forecast7d": detail_row.get("forecast7d") if detail_row else None,
            "forecast30d": detail_row.get("forecast30d") if detail_row else None,
            "return1d": detail_row.get("return1d") if detail_row else None,
            "return7d": detail_row.get("return7d") if detail_row else None,
            "return30d": detail_row.get("return30d") if detail_row else None,
            "bestRmse1Name": best_rmse1["name"] if best_rmse1 else None,
            "bestRmse7Name": best_rmse7["name"] if best_rmse7 else None,
            "bestRmse30Name": best_rmse30["name"] if best_rmse30 else None,
            "bestHit1Name": best_hit1["name"] if best_hit1 else None,
            "bestHit7Name": best_hit7["name"] if best_hit7 else None,
            "bestHit30Name": best_hit30["name"] if best_hit30 else None,
            "bestAicName": best_aic["name"] if best_aic else None,
            "bestBicName": best_bic["name"] if best_bic else None,
            "bestMae7Name": best_mae7["name"] if best_mae7 else None,
        },
        "detail": detail_row,
        "series": series,
        "horizons": list(BT_HORIZONS),
        "guide": [
            {"prefer": "Naive / Drift", "when": "Sanity check — beat these OOS before trusting complex specs."},
            {"prefer": "ARIMA / ARMA / SARIMA", "when": "Short-memory structure in returns or log-price differences."},
            {"prefer": "ETS / Holt / HW / Theta", "when": "Smooth local trend + weekly seasonality without heavy MLE."},
            {"prefer": "Prophet", "when": "You want automatic weekly/yearly seasonality (needs prophet package)."},
            {"prefer": "ARIMAX", "when": "Macro (SPX/DXY/rates) and on-chain growth should shift the mean return."},
            {"prefer": "Kalman / UC", "when": "You want a latent level/trend (or cycle) via state-space filtering."},
            {"prefer": "VAR / SVAR", "when": "BTC co-moves with SPX and DXY; structural shocks matter."},
            {"prefer": "VECM", "when": "You believe BTC and equities share a long-run cointegrating link."},
        ],
        "glossary": {
            "HIT": (
                "Directional hit rate: share of OOS origins where the sign of the predicted "
                "h-day log return matches realized (primary selection criterion)."
            ),
            "RMSE": "Root mean squared error of h-day log-return forecasts (lower better).",
            "MAE": "Mean absolute error of h-day log-return forecasts (lower better).",
            "MAPE": "Mean absolute % error on price level forecasts.",
            "AIC": "Akaike information criterion (in-sample; lower better; parsimony vs fit).",
            "BIC": "Bayesian information criterion (in-sample; stronger param penalty than AIC).",
            "dirHit": "Share of origins where sign of predicted return matches realized.",
            "N_OOS": (
                "Number of expanding-window origin dates used in the backtest — not the "
                "number of calendar days in the sample. Origins are thinned (every N days) "
                "for speed; longer samples increase N OOS up to a safety cap."
            ),
            "ADF": "Augmented Dickey-Fuller on returns — reject unit root ⇒ stationary returns.",
            "SVAR": "Structural VAR with recursive (Cholesky) identification.",
            "Selection": (
                "Desk mark maximizes 7d OOS hit rate; ties break on 1d/30d hit, then RMSE, "
                "MAE, AIC, BIC. In-sample criteria never outrank OOS direction."
            ),
        },
        "fromCache": False,
    }
    _cache_set(key, payload)
    return payload


def get_timeseries_model_payload(
    model_id: str,
    *,
    days: int = 3650,
    refresh: bool = False,
) -> dict[str, Any]:
    suite = get_timeseries_suite_payload(days=days, models=[model_id], refresh=refresh)
    row = next((m for m in suite.get("models") or [] if m["id"] == model_id), None)
    if not row:
        return {"ok": False, "error": f"Unknown model {model_id}"}
    return {
        "ok": row["status"] == "ok",
        "model": row,
        "series": suite.get("series"),
        "summary": suite.get("summary"),
        "asOf": suite.get("asOf"),
        "macroAvailable": suite.get("macroAvailable"),
        "statsmodelsAvailable": suite.get("statsmodelsAvailable"),
    }
