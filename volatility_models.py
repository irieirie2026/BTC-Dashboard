"""
BTC Volatility suite — ARCH/GARCH family estimation for Stats → Volatility.

Uses the `arch` package when installed (preferred). Falls back to a pure-NumPy
GARCH(1,1) / GJR-GARCH QMLE path so the section still works without extra deps.

Cache key: model + range + distribution + orders.
"""

from __future__ import annotations

import hashlib
import math
import time
from datetime import datetime, timezone
from typing import Any

import numpy as np

# Optional heavy stack
try:
    from arch import arch_model  # type: ignore

    ARCH_AVAILABLE = True
except Exception:
    arch_model = None  # type: ignore
    ARCH_AVAILABLE = False

try:
    import pandas as pd
except Exception:
    pd = None  # type: ignore

TRADING_DAYS_CRYPTO = 365.0
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL = 1800  # 30 min

# Catalog: id, label, family, equation, param meanings, arch kwargs
MODEL_CATALOG: list[dict[str, Any]] = [
    {
        "id": "arch11",
        "name": "ARCH(1)",
        "family": "core",
        "orders": {"p": 1, "q": 0},
        "blurb": "Conditional variance depends only on lagged squared residuals.",
        "whyBtc": "Baseline clustering model; usually underperforms GARCH on BTC.",
        "equation": "σ²_t = ω + α · ε²_{t-1}",
        "equationNote": "ε_t = r_t − μ are mean residuals (log returns).",
        "paramHelp": {
            "omega": "Baseline variance floor (must be > 0).",
            "alpha": "Weight on yesterday’s squared shock — how much a large move lifts next-day variance.",
            "alpha[1]": "Weight on yesterday’s squared shock — how much a large move lifts next-day variance.",
            "mu": "Mean of daily log returns (drift).",
            "const": "Mean of daily log returns (drift).",
        },
        "arch": {"vol": "ARCH", "p": 1, "q": 0},
    },
    {
        "id": "garch11",
        "name": "GARCH(1,1)",
        "family": "core",
        "orders": {"p": 1, "q": 1},
        "blurb": "Workhorse model: variance mean-reverts with persistence α+β.",
        "whyBtc": "Standard benchmark; captures clustering but not leverage asymmetry.",
        "equation": "σ²_t = ω + α · ε²_{t-1} + β · σ²_{t-1}",
        "equationNote": "Persistence ≈ α+β. Half-life of a variance shock ≈ ln(0.5)/ln(α+β).",
        "paramHelp": {
            "omega": "Long-run variance level (scaled). Higher → higher floor vol.",
            "alpha": "ARCH: reaction to last return shock (news).",
            "alpha[1]": "ARCH: reaction to last return shock (news).",
            "beta": "GARCH: memory of past variance (clustering).",
            "beta[1]": "GARCH: memory of past variance (clustering).",
            "mu": "Mean daily log return.",
            "const": "Mean daily log return.",
            "nu": "Student-t degrees of freedom (tail thickness; lower = fatter tails).",
            "eta": "GED shape parameter.",
            "lambda": "Skew parameter (skewed-t).",
        },
        "arch": {"vol": "Garch", "p": 1, "q": 1},
    },
    {
        "id": "garch12",
        "name": "GARCH(1,2)",
        "family": "core",
        "orders": {"p": 1, "q": 2},
        "blurb": "Extra lag on past variance for slower mean reversion.",
        "whyBtc": "Useful when volatility shocks linger longer than GARCH(1,1) allows.",
        "equation": "σ²_t = ω + α₁ε²_{t-1} + β₁σ²_{t-1} + β₂σ²_{t-2}",
        "equationNote": "Two variance lags; persistence ≈ α₁+β₁+β₂.",
        "paramHelp": {
            "omega": "Variance floor.",
            "alpha[1]": "Weight on last squared residual.",
            "beta[1]": "Weight on σ²_{t-1}.",
            "beta[2]": "Weight on σ²_{t-2} (slower decay).",
            "mu": "Mean return.",
            "const": "Mean return.",
            "nu": "Student-t df (tails).",
        },
        "arch": {"vol": "Garch", "p": 1, "q": 2},
    },
    {
        "id": "garch21",
        "name": "GARCH(2,1)",
        "family": "core",
        "orders": {"p": 2, "q": 1},
        "blurb": "Extra ARCH lag for richer short-run shock response.",
        "whyBtc": "Can fit multi-day jump clusters after liquidations.",
        "equation": "σ²_t = ω + α₁ε²_{t-1} + α₂ε²_{t-2} + β₁σ²_{t-1}",
        "equationNote": "Two shock lags; useful after clustered liquidation days.",
        "paramHelp": {
            "omega": "Variance floor.",
            "alpha[1]": "Weight on ε²_{t-1}.",
            "alpha[2]": "Weight on ε²_{t-2}.",
            "beta[1]": "Weight on past variance.",
            "mu": "Mean return.",
            "const": "Mean return.",
            "nu": "Student-t df (tails).",
        },
        "arch": {"vol": "Garch", "p": 2, "q": 1},
    },
    {
        "id": "egarch11",
        "name": "EGARCH(1,1)",
        "family": "asymmetric",
        "orders": {"p": 1, "q": 1, "o": 1},
        "blurb": "Log-variance; asymmetric news impact without positivity constraints.",
        "whyBtc": "Often preferred on BTC for leverage-style asymmetry after dumps.",
        "equation": "ln(σ²_t) = ω + β ln(σ²_{t-1}) + α(|z_{t-1}| − E|z|) + γ z_{t-1}",
        "equationNote": "z = ε/σ. γ < 0 ⇒ negative returns raise vol more (classic leverage).",
        "paramHelp": {
            "omega": "Level of log-variance.",
            "alpha[1]": "Magnitude effect of |z| (size of shock).",
            "alpha": "Magnitude effect of |z|.",
            "gamma[1]": "Sign/leverage effect: negative γ → dumps lift vol more than pumps.",
            "gamma": "Sign/leverage effect.",
            "beta[1]": "Persistence of log-variance.",
            "beta": "Persistence of log-variance.",
            "mu": "Mean return.",
            "const": "Mean return.",
            "nu": "Student-t df.",
        },
        "arch": {"vol": "EGARCH", "p": 1, "q": 1, "o": 1},
    },
    {
        "id": "gjr11",
        "name": "GJR-GARCH(1,1)",
        "family": "asymmetric",
        "orders": {"p": 1, "q": 1, "o": 1},
        "blurb": "Extra γ term when returns are negative (leverage / TGARCH style).",
        "whyBtc": "Classic choice when crashes raise next-day vol more than pumps.",
        "equation": "σ²_t = ω + (α + γ·I_{ε<0}) ε²_{t-1} + β σ²_{t-1}",
        "equationNote": "I_{ε<0}=1 on down days. γ > 0 ⇒ extra vol after negative returns.",
        "paramHelp": {
            "omega": "Variance floor.",
            "alpha[1]": "Base reaction to |shock| (all days).",
            "alpha": "Base reaction to shock.",
            "gamma[1]": "Extra weight on negative-return days (leverage).",
            "gamma": "Extra weight on negative-return days.",
            "beta[1]": "Variance memory.",
            "beta": "Variance memory.",
            "mu": "Mean return.",
            "const": "Mean return.",
            "nu": "Student-t df.",
        },
        "arch": {"vol": "GARCH", "p": 1, "q": 1, "o": 1},
    },
    {
        "id": "aparch11",
        "name": "APARCH(1,1)",
        "family": "asymmetric",
        "orders": {"p": 1, "q": 1, "o": 1},
        "blurb": "Power and asymmetry parameters; nests several asymmetric models.",
        "whyBtc": "Flexible news impact curve; heavier to estimate.",
        "equation": "σ^δ_t = ω + α (|ε_{t-1}| − γ ε_{t-1})^δ + β σ^δ_{t-1}",
        "equationNote": "δ is the power; γ is asymmetry. Nests GARCH/GJR for special cases.",
        "paramHelp": {
            "omega": "Floor for powered variance.",
            "alpha[1]": "Weight on powered absolute residual.",
            "gamma[1]": "Asymmetry in the news impact (|ε|−γε).",
            "beta[1]": "Memory of powered variance.",
            "delta": "Power transform on volatility (δ=2 ≈ variance).",
            "mu": "Mean return.",
            "const": "Mean return.",
            "nu": "Student-t df.",
        },
        "arch": {"vol": "APARCH", "p": 1, "q": 1, "o": 1},
    },
    {
        "id": "figarch11",
        "name": "FIGARCH(1,d,1)",
        "family": "long_memory",
        "orders": {"p": 1, "q": 1},
        "blurb": "Fractional integration in variance — long-memory volatility.",
        "whyBtc": "BTC often shows slow vol decay; FIGARCH targets that feature.",
        "equation": "σ²_t = ω + [1 − βL − (1−φL)(1−L)^d] ε²_t + β σ²_{t-1}",
        "equationNote": "d ∈ (0,1) is fractional integration (long memory in variance).",
        "paramHelp": {
            "omega": "Variance level.",
            "phi": "Short-run AR coefficient in the FIGARCH filter.",
            "d": "Fractional integration: higher d ⇒ slower hyperbolic decay of shocks.",
            "beta": "GARCH-type lag on variance.",
            "mu": "Mean return.",
            "const": "Mean return.",
            "nu": "Student-t df.",
        },
        "arch": {"vol": "FIGARCH", "p": 1, "q": 1},
    },
    {
        "id": "har_rv",
        "name": "HAR-RV",
        "family": "benchmark",
        "orders": {},
        "blurb": "Heterogeneous AR on realized-vol proxy (daily / weekly / monthly).",
        "whyBtc": "Strong forecast benchmark from OHLC proxies without full GARCH MLE — widely used as a Deribit RV anchor vs DVOL/IV.",
        "equation": "RV_t = c + β_d RV^{(d)}_{t-1} + β_w RV^{(w)}_{t-1} + β_m RV^{(m)}_{t-1} + u_t",
        "equationNote": "RV^{(d)}=yesterday’s RV; RV^{(w)}=avg of last 5; RV^{(m)}=avg of last 22. Parkinson high–low (or r² if OHLC flat).",
        "paramHelp": {
            "const": "Intercept — baseline level of next-day realized variance.",
            "RV_d (daily)": "Weight on yesterday’s RV (short-horizon traders / noise).",
            "RV_w (weekly)": "Weight on ~1-week average RV (swing horizon).",
            "RV_m (monthly)": "Weight on ~1-month average RV (slower component).",
            "RV_d": "Weight on yesterday’s RV.",
            "RV_w": "Weight on weekly RV.",
            "RV_m": "Weight on monthly RV.",
        },
        "arch": None,
    },
]

# Backtest horizons (calendar days of crypto returns)
BT_HORIZONS = (1, 7, 14, 30)


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


def _half_life(persistence: float | None) -> float | None:
    if persistence is None or not (0 < persistence < 1):
        return None
    try:
        return math.log(0.5) / math.log(persistence)
    except (ValueError, ZeroDivisionError):
        return None


def _ann_vol(sigma_daily: float) -> float:
    return float(sigma_daily) * math.sqrt(TRADING_DAYS_CRYPTO)


def _load_returns(days: int = 1095) -> dict[str, Any]:
    """Load BTC log returns from existing stats history pipeline."""
    from server import get_stats_btc_history_payload

    hist = get_stats_btc_history_payload(refresh=False)
    rows = hist.get("days") or []
    if len(rows) < 60:
        raise RuntimeError("Insufficient BTC history for volatility estimation")

    closes = []
    dates = []
    highs = []
    lows = []
    opens = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        c = r.get("close")
        if c is None:
            continue
        try:
            closes.append(float(c))
            dates.append(r.get("date") or r.get("t") or r.get("time"))
            highs.append(float(r.get("high") or c))
            lows.append(float(r.get("low") or c))
            opens.append(float(r.get("open") or c))
        except (TypeError, ValueError):
            continue

    if len(closes) < 60:
        raise RuntimeError("Insufficient clean closes for volatility estimation")

    # Keep last `days` calendar span approximately
    if days and days > 0 and len(closes) > days + 1:
        closes = closes[-(days + 1) :]
        dates = dates[-(days + 1) :]
        highs = highs[-(days + 1) :]
        lows = lows[-(days + 1) :]
        opens = opens[-(days + 1) :]

    c = np.asarray(closes, dtype=float)
    log_ret = np.diff(np.log(c))
    # Drop non-finite
    mask = np.isfinite(log_ret)
    log_ret = log_ret[mask]
    ret_dates = [dates[i + 1] for i in range(len(mask)) if mask[i]]
    # Align OHLC for RV proxy (same length as returns)
    h = np.asarray(highs[1:], dtype=float)[mask]
    l = np.asarray(lows[1:], dtype=float)[mask]
    o = np.asarray(opens[1:], dtype=float)[mask]
    cl = c[1:][mask]

    return {
        "returns": log_ret,
        "dates": ret_dates,
        "close": cl,
        "high": h,
        "low": l,
        "open": o,
        "source": hist.get("source") or "stats_btc_history",
        "pair": hist.get("pair") or "BTC/USD",
        "endDate": ret_dates[-1] if ret_dates else None,
        "startDate": ret_dates[0] if ret_dates else None,
        "n": int(len(log_ret)),
    }


def _parkinson_rv(high: np.ndarray, low: np.ndarray) -> np.ndarray:
    """Parkinson (1980) high-low variance proxy (daily)."""
    hl = np.log(np.maximum(high, low + 1e-12) / np.maximum(low, 1e-12))
    return (hl ** 2) / (4.0 * math.log(2.0))


def _normal_sf_two_sided(z: float) -> float:
    """Two-sided p-value from standard normal (erfc)."""
    return float(math.erfc(abs(z) / math.sqrt(2.0)))


def _fit_har(data: dict[str, Any]) -> dict[str, Any]:
    """HAR-RV on Parkinson realized variance proxy (with OLS SE + persistence)."""
    # Prefer Parkinson when high≠low; else squared returns as RV proxy
    high = np.asarray(data["high"], dtype=float)
    low = np.asarray(data["low"], dtype=float)
    rets = np.asarray(data["returns"], dtype=float)
    span = np.maximum(high - low, 0.0)
    if np.nanmedian(span / np.maximum(np.abs(data["close"]), 1e-8)) < 1e-8:
        # OHLC collapsed (flat high/low) — use squared log returns
        rv = np.maximum(rets ** 2, 1e-12)
        rv_note = "RV proxy: squared log returns (OHLC high/low not informative)"
    else:
        rv = _parkinson_rv(high, low)
        rv = np.maximum(rv, 1e-12)
        rv_note = "RV proxy: Parkinson high–low"

    n = len(rv)
    if n < 40:
        return {"ok": False, "error": "HAR needs more data"}

    # Build daily, weekly (5), monthly (22) averages of past RV
    y_list = []
    x_rows = []
    for t in range(22, n):
        d = float(rv[t - 1])
        w = float(np.mean(rv[max(0, t - 5) : t]))
        m = float(np.mean(rv[max(0, t - 22) : t]))
        y_list.append(float(rv[t]))
        x_rows.append([1.0, d, w, m])
    y = np.asarray(y_list, dtype=float)
    X = np.asarray(x_rows, dtype=float)
    n_obs, k = X.shape
    try:
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}

    fitted = X @ beta
    resid = y - fitted
    # Unbiased residual variance
    dof = max(1, n_obs - k)
    sigma2 = float(np.sum(resid ** 2) / dof)
    sigma2 = max(sigma2, 1e-18)

    # OLS standard errors, t-stats, p-values
    try:
        xtx_inv = np.linalg.inv(X.T @ X)
        se = np.sqrt(np.maximum(np.diag(xtx_inv) * sigma2, 0.0))
    except Exception:
        se = np.full(k, np.nan)
    t_stats = np.divide(beta, se, out=np.full(k, np.nan), where=se > 1e-15)
    p_vals = [
        _normal_sf_two_sided(float(t)) if np.isfinite(t) else None for t in t_stats
    ]

    names = ["const", "RV_d (daily)", "RV_w (weekly)", "RV_m (monthly)"]
    params = []
    for i, name in enumerate(names):
        params.append(
            {
                "name": name,
                "estimate": float(beta[i]),
                "stdError": float(se[i]) if np.isfinite(se[i]) else None,
                "tStat": float(t_stats[i]) if np.isfinite(t_stats[i]) else None,
                "pValue": p_vals[i],
            }
        )

    # Cond vol path: sqrt of fitted RV (return units)
    cond = np.sqrt(np.maximum(fitted, 1e-12))
    std_resid_fit = resid / np.sqrt(np.maximum(fitted, 1e-12))

    last_x = np.array(
        [
            1.0,
            float(rv[-1]),
            float(np.mean(rv[-5:])),
            float(np.mean(rv[-22:])),
        ]
    )
    f1 = float(last_x @ beta)
    f1 = max(f1, 1e-12)

    # Multi-step forecast feeding components
    forecasts = []
    d_comp, w_comp, m_comp = float(rv[-1]), float(np.mean(rv[-5:])), float(np.mean(rv[-22:]))
    for _h in range(1, 31):
        f = float(beta[0] + beta[1] * d_comp + beta[2] * w_comp + beta[3] * m_comp)
        f = max(f, 1e-12)
        forecasts.append(_ann_vol(math.sqrt(f)))
        d_comp = f
        w_comp = 0.8 * w_comp + 0.2 * f
        m_comp = 0.95 * m_comp + 0.05 * f

    # Gaussian LL on the *RV regression residual* (levels of Parkinson/sq-return RV).
    # This is a valid IC *within* HAR-style RV models only — NOT comparable to GARCH
    # AIC/BIC, which are return-level likelihoods (arch / numpy GARCH). Different
    # dependent variable and residual scale ⇒ HAR AIC often looks absurdly low.
    ll = float(-0.5 * n_obs * (math.log(2 * math.pi) + math.log(sigma2) + 1.0))
    aic = float(2 * k - 2 * ll)
    bic = float(k * math.log(n_obs) - 2 * ll)
    hqic = float(2 * k * math.log(math.log(max(n_obs, 3))) - 2 * ll)

    # HAR persistence proxy: sum of slope coeffs on RV components (clipped)
    pers = float(beta[1] + beta[2] + beta[3])
    if not np.isfinite(pers):
        pers = None
    else:
        pers = float(max(0.0, min(0.999, abs(pers))))

    # Align cond vol + std resid to full sample length
    full_cond = np.full(n, np.nan, dtype=float)
    full_std = np.full(n, np.nan, dtype=float)
    full_cond[22:22 + len(cond)] = cond
    full_std[22:22 + len(std_resid_fit)] = std_resid_fit
    first_c = float(cond[0]) if len(cond) else 0.02
    first_s = float(std_resid_fit[0]) if len(std_resid_fit) else 0.0
    for i in range(n):
        if not np.isfinite(full_cond[i]):
            full_cond[i] = first_c
        else:
            break
    for i in range(n):
        if not np.isfinite(full_std[i]):
            full_std[i] = first_s
        else:
            break
    # trailing fill
    for i in range(1, n):
        if not np.isfinite(full_cond[i]):
            full_cond[i] = full_cond[i - 1]
        if not np.isfinite(full_std[i]):
            full_std[i] = full_std[i - 1]

    cur_ann = _ann_vol(math.sqrt(f1))
    unc_ann = _ann_vol(math.sqrt(float(np.mean(rv))))

    return {
        "ok": True,
        "params": params,
        "logLikelihood": ll,
        "aic": aic,
        "bic": bic,
        "hqic": hqic,
        # Exclude from suite AIC/BIC ranking — different likelihood target than GARCH
        "icComparable": False,
        "icNote": (
            "HAR AIC/BIC are Gaussian ICs on the RV regression residual, not on returns. "
            "Do not rank against GARCH/EGARCH/etc. Compare HAR via QLIKE / R² / forecast paths."
        ),
        "nParams": k,
        "persistence": pers,
        "halfLifeDays": _half_life(pers),
        "unconditionalVolAnn": unc_ann,
        "condVol": full_cond.tolist(),
        "stdResid": full_std.tolist(),
        "forecastAnn": forecasts,
        "currentCondVolAnn": cur_ann,
        "engine": "har-numpy",
        "warning": rv_note,
        "rSquared": float(1.0 - np.var(resid) / max(np.var(y), 1e-18)),
    }


def _fit_garch11_numpy(returns: np.ndarray) -> dict[str, Any]:
    """Simple GARCH(1,1) QMLE with Normal errors (fallback)."""
    r = returns * 100.0  # percent for numerical scale
    n = len(r)
    # Starting values
    omega, alpha, beta = 0.05, 0.08, 0.90
    var = np.zeros(n)
    var[0] = float(np.var(r))

    def nll(theta):
        o, a, b = theta
        if o <= 0 or a < 0 or b < 0 or a + b >= 0.999:
            return 1e12
        v = np.empty(n)
        v[0] = float(np.var(r))
        for t in range(1, n):
            v[t] = o + a * r[t - 1] ** 2 + b * v[t - 1]
            if v[t] <= 1e-12:
                return 1e12
        return float(0.5 * np.sum(np.log(v) + r ** 2 / v))

    # Crude grid + coordinate descent
    best = (omega, alpha, beta)
    best_ll = nll(best)
    for o in (0.01, 0.05, 0.1, 0.2):
        for a in (0.03, 0.06, 0.1, 0.15):
            for b in (0.8, 0.85, 0.9, 0.94):
                if a + b >= 0.999:
                    continue
                val = nll((o, a, b))
                if val < best_ll:
                    best_ll = val
                    best = (o, a, b)
    omega, alpha, beta = best
    # One more local refine
    for scale in (0.5, 0.8, 1.0, 1.2, 1.5):
        cand = (omega * scale, alpha, beta)
        val = nll(cand)
        if val < best_ll:
            best_ll = val
            best = cand
    omega, alpha, beta = best

    var = np.empty(n)
    var[0] = float(np.var(r))
    for t in range(1, n):
        var[t] = omega + alpha * r[t - 1] ** 2 + beta * var[t - 1]
    sigma = np.sqrt(np.maximum(var, 1e-12)) / 100.0  # back to return units
    std_resid = (r / 100.0) / sigma
    pers = alpha + beta
    unc = omega / max(1e-12, 1 - pers) if pers < 1 else None
    unc_vol = _ann_vol(math.sqrt(unc) / 100.0) if unc and unc > 0 else None
    k = 3
    ll = -best_ll  # nll was positive half-sum
    # Approximate LL scale
    aic = 2 * k + 2 * best_ll
    bic = k * math.log(n) + 2 * best_ll

    # Forecasts
    last_r2 = r[-1] ** 2
    last_v = var[-1]
    forecasts = []
    v_h = last_v
    for h in range(1, 31):
        if h == 1:
            v_h = omega + alpha * last_r2 + beta * last_v
        else:
            v_h = omega + (alpha + beta) * v_h
        forecasts.append(_ann_vol(math.sqrt(max(v_h, 1e-12)) / 100.0))

    return {
        "ok": True,
        "params": [
            {"name": "omega", "estimate": float(omega), "stdError": None, "tStat": None, "pValue": None},
            {"name": "alpha", "estimate": float(alpha), "stdError": None, "tStat": None, "pValue": None},
            {"name": "beta", "estimate": float(beta), "stdError": None, "tStat": None, "pValue": None},
        ],
        "logLikelihood": float(-best_ll),
        "aic": float(aic),
        "bic": float(bic),
        "hqic": float(aic),
        "nParams": k,
        "persistence": float(pers),
        "halfLifeDays": _half_life(pers),
        "unconditionalVolAnn": unc_vol,
        "condVol": sigma.tolist(),
        "stdResid": std_resid.tolist(),
        "forecastAnn": forecasts,
        "currentCondVolAnn": _ann_vol(float(sigma[-1])),
        "engine": "numpy-garch11",
        "warning": "arch package not installed — using pure-NumPy GARCH(1,1) fallback for this model.",
    }


def _fit_arch(model_id: str, catalog: dict[str, Any], data: dict[str, Any], dist: str) -> dict[str, Any]:
    if catalog["id"] == "har_rv":
        return _fit_har(data)

    returns = data["returns"]
    if not ARCH_AVAILABLE or catalog.get("arch") is None:
        # Fallback: only GARCH-like via numpy
        if catalog["id"] in ("garch11", "arch11", "garch12", "garch21", "gjr11", "egarch11", "aparch11", "figarch11"):
            out = _fit_garch11_numpy(returns)
            if catalog["id"] != "garch11":
                out["warning"] = (
                    f"arch not installed — estimated GARCH(1,1) fallback instead of {catalog['name']}. "
                    "Install with: pip install arch"
                )
                out["fallbackFrom"] = catalog["name"]
            return out
        return {"ok": False, "error": "Model requires arch package"}

    # arch expects percent returns often
    y = returns * 100.0
    kwargs = dict(catalog["arch"])
    dist_map = {
        "normal": "normal",
        "t": "t",
        "studentt": "t",
        "ged": "ged",
        "skewt": "skewt",
        "skewed-t": "skewt",
    }
    dist_key = dist_map.get((dist or "t").lower(), "t")
    try:
        am = arch_model(y, mean="Constant", dist=dist_key, **kwargs)
        res = am.fit(disp="off", show_warning=False)
    except Exception as exc:
        # Retry with normal dist
        try:
            am = arch_model(y, mean="Constant", dist="normal", **kwargs)
            res = am.fit(disp="off", show_warning=False)
        except Exception as exc2:
            return {"ok": False, "error": str(exc2)[:240]}

    params = []
    try:
        for name in res.params.index:
            est = float(res.params[name])
            se = float(res.std_err[name]) if name in res.std_err.index else None
            t = float(res.tvalues[name]) if name in res.tvalues.index else None
            p = float(res.pvalues[name]) if name in res.pvalues.index else None
            params.append(
                {
                    "name": str(name),
                    "estimate": est,
                    "stdError": se,
                    "tStat": t,
                    "pValue": p,
                }
            )
    except Exception:
        params = [
            {"name": str(k), "estimate": float(v), "stdError": None, "tStat": None, "pValue": None}
            for k, v in res.params.items()
        ]

    # Conditional volatility in return units
    cond = np.asarray(res.conditional_volatility, dtype=float) / 100.0
    std_resid = np.asarray(res.std_resid, dtype=float)

    # Persistence heuristics
    pmap = {str(k).lower(): float(v) for k, v in res.params.items()}
    alpha = pmap.get("alpha[1]") or pmap.get("alpha") or 0.0
    beta = pmap.get("beta[1]") or pmap.get("beta") or 0.0
    gamma = pmap.get("gamma[1]") or pmap.get("gamma") or 0.0
    pers = None
    if "egarch" in catalog["id"]:
        pers = abs(beta) if beta else None
    elif "gjr" in catalog["id"]:
        pers = alpha + beta + 0.5 * gamma
    else:
        pers = alpha + beta if (alpha or beta) else None
    if pers is not None and pers >= 1:
        pers = min(pers, 0.999)

    # Forecasts (1..30)
    forecasts = []
    try:
        f = res.forecast(horizon=30, reindex=False)
        # variance forecasts
        var_f = f.variance.values[-1]
        for h in range(30):
            v = float(var_f[h]) if h < len(var_f) else float(var_f[-1])
            forecasts.append(_ann_vol(math.sqrt(max(v, 1e-12)) / 100.0))
    except Exception:
        last = float(cond[-1])
        for h in range(1, 31):
            if pers and pers < 1:
                # mean-revert toward sample vol
                unc = float(np.mean(cond))
                sig = unc + (last - unc) * (pers ** h)
                forecasts.append(_ann_vol(max(sig, 1e-8)))
            else:
                forecasts.append(_ann_vol(last))

    ll = float(res.loglikelihood) if hasattr(res, "loglikelihood") else None
    aic = float(res.aic) if hasattr(res, "aic") else None
    bic = float(res.bic) if hasattr(res, "bic") else None

    # Unconditional vol (rough)
    unc_ann = _ann_vol(float(np.mean(cond)))

    # Residual diagnostics (Ljung-Box-ish simplified via ACF of sq resid)
    sq = std_resid ** 2
    acf1 = float(np.corrcoef(sq[1:], sq[:-1])[0, 1]) if len(sq) > 5 else 0.0

    return {
        "ok": True,
        "params": params,
        "logLikelihood": ll,
        "aic": aic,
        "bic": bic,
        "hqic": aic,
        "nParams": len(params),
        "persistence": float(pers) if pers is not None else None,
        "halfLifeDays": _half_life(pers),
        "unconditionalVolAnn": unc_ann,
        "condVol": cond.tolist(),
        "stdResid": std_resid.tolist(),
        "forecastAnn": forecasts,
        "currentCondVolAnn": _ann_vol(float(cond[-1])),
        "engine": "arch",
        "archLmProxy": abs(acf1),
        "distribution": dist_key,
    }


def _news_impact_curve(model_id: str, fit: dict[str, Any]) -> list[dict[str, float]]:
    """Approximate news impact curve from estimated params (return shock in %)."""
    shocks = np.linspace(-5, 5, 41)  # percent
    pmap = {str(p["name"]).lower(): p["estimate"] for p in fit.get("params") or []}

    # HAR-RV: shock enters via daily RV component (symmetric in squared shock)
    if model_id == "har_rv" or fit.get("engine") == "har-numpy":
        b0 = pmap.get("const", 0.0)
        bd = pmap.get("rv_d (daily)", pmap.get("rv_d", 0.3))
        bw = pmap.get("rv_w (weekly)", pmap.get("rv_w", 0.3))
        bm = pmap.get("rv_m (monthly)", pmap.get("rv_m", 0.3))
        unc = fit.get("unconditionalVolAnn") or 0.5
        # baseline RV from long-run ann vol
        base_sig = unc / math.sqrt(TRADING_DAYS_CRYPTO)
        v_bar = max(base_sig ** 2, 1e-12)
        out = []
        for s in shocks:
            # percent return → daily variance shock in return units then scale like RV
            r = s / 100.0
            rv_shock = max(r ** 2, 1e-12)
            f = b0 + bd * rv_shock + bw * v_bar + bm * v_bar
            f = max(f, 1e-12)
            out.append({"shockPct": float(s), "nextVolAnn": _ann_vol(math.sqrt(f))})
        return out

    omega = pmap.get("omega", 0.05)
    alpha = pmap.get("alpha[1]", pmap.get("alpha", 0.08))
    beta = pmap.get("beta[1]", pmap.get("beta", 0.9))
    gamma = pmap.get("gamma[1]", pmap.get("gamma", 0.0))
    # Use long-run variance as baseline lag
    pers = fit.get("persistence") or (alpha + beta)
    if pers is None or pers >= 1:
        pers = 0.99
    v_bar = omega / max(1e-8, 1 - pers) if omega > 0 else 0.05
    out = []
    for s in shocks:
        r2 = (s) ** 2
        if "gjr" in model_id or "aparch" in model_id:
            ind = 1.0 if s < 0 else 0.0
            v = omega + (alpha + gamma * ind) * r2 + beta * v_bar
        elif "egarch" in model_id:
            z = s / max(math.sqrt(v_bar), 1e-6)
            logv = math.log(max(v_bar, 1e-8)) + alpha * (abs(z) - math.sqrt(2 / math.pi)) + gamma * z
            v = math.exp(logv)
        else:
            v = omega + alpha * r2 + beta * v_bar
        out.append({"shockPct": float(s), "nextVolAnn": _ann_vol(math.sqrt(max(v, 1e-12)) / 100.0)})
    return out


def _var_es(cond_vol_daily: float, dist: str = "t") -> dict[str, float]:
    """1-day VaR / ES under Normal or Student-t (ν=6) using conditional sigma."""
    from math import erf, sqrt

    # Normal quantiles
    z95, z99 = 1.64485, 2.32635
    # Student-t ν=6 heavier tails approx scale
    t95, t99 = 1.943, 3.143
    use_t = dist in ("t", "studentt", "skewt", "skewed-t", "ged")
    q95 = t95 if use_t else z95
    q99 = t99 if use_t else z99
    s = cond_vol_daily
    return {
        "var95": -q95 * s,
        "var99": -q99 * s,
        "es95": -s * (1.14 if use_t else 2.06) / 1.0,  # rough ES factors
        "es99": -s * (1.8 if use_t else 2.67),
    }


def _regime_label(ann_vol: float, unc_ann: float | None) -> str:
    base = unc_ann or 0.55
    ratio = ann_vol / base if base else 1.0
    if ratio < 0.7:
        return "Low"
    if ratio < 1.1:
        return "Normal"
    if ratio < 1.6:
        return "Elevated"
    return "Extreme"


def _annotate_params(params: list[dict[str, Any]], catalog: dict[str, Any]) -> list[dict[str, Any]]:
    help_map = catalog.get("paramHelp") or {}
    out = []
    for p in params or []:
        name = str(p.get("name") or "")
        meaning = (
            help_map.get(name)
            or help_map.get(name.lower())
            or help_map.get(name.split("[")[0].lower())
            or "Coefficient in the fitted specification (see equation)."
        )
        # fuzzy for arch names like alpha[1]
        if meaning.startswith("Coefficient") and "[" in name:
            base = name.split("[")[0]
            for k, v in help_map.items():
                if k.lower().startswith(base.lower()):
                    meaning = v
                    break
        q = dict(p)
        q["meaning"] = meaning
        out.append(q)
    return out


def _realized_var_ahead(returns: np.ndarray, t: int, h: int) -> float | None:
    """Sum of squared log returns over the next h days (realized variance)."""
    if t + h > len(returns):
        return None
    chunk = returns[t : t + h]
    if len(chunk) < h:
        return None
    return float(np.sum(chunk ** 2))


def _qlike(f_var: float, rv: float) -> float:
    f = max(f_var, 1e-14)
    r = max(rv, 1e-14)
    return float(math.log(f) + r / f)


def _backtest_model(
    model_id: str,
    catalog: dict[str, Any],
    data: dict[str, Any],
    dist: str,
    *,
    horizons: tuple[int, ...] = BT_HORIZONS,
    step: int = 28,
    min_train: int = 365,
    max_origins: int = 10,
) -> dict[str, Any]:
    """
    Expanding-window forecast backtest for option-relevant horizons.
    Compares model multi-day variance forecasts to realized sum of squared returns.
    Losses: QLIKE (primary for vol), MSE, MAE on variance scale.
    """
    returns = np.asarray(data["returns"], dtype=float)
    n = len(returns)
    if n < min_train + max(horizons) + step:
        return {"ok": False, "error": "Insufficient sample for backtest", "horizons": {}}

    origins = list(range(min_train, n - max(horizons), step))
    if len(origins) > max_origins:
        # Keep most recent origins (more relevant for current Deribit pricing)
        origins = origins[-max_origins:]

    # Accumulators per horizon
    bags: dict[int, dict[str, list[float]]] = {
        h: {"qlike": [], "mse": [], "mae": [], "bias": []} for h in horizons
    }

    for t in origins:
        # Slice training data
        sub = {
            "returns": returns[:t],
            "dates": data["dates"][:t],
            "close": data["close"][:t],
            "high": data["high"][:t],
            "low": data["low"][:t],
            "open": data["open"][:t],
            "n": t,
        }
        try:
            fit = _fit_arch(model_id, catalog, sub, dist)
        except Exception:
            continue
        if not fit.get("ok"):
            continue
        f_ann = fit.get("forecastAnn") or []
        if not f_ann:
            continue
        # Convert annualized vol forecast at horizon h to multi-day variance:
        # σ_ann(h) is "average" path vol; use σ_daily^2 * h with σ_daily = σ_ann/√365
        for h in horizons:
            if h > len(f_ann):
                continue
            # Use h-step ahead annualized forecast (1-indexed in list as h-1)
            sig_ann = float(f_ann[h - 1])
            if not math.isfinite(sig_ann) or sig_ann <= 0:
                continue
            # h-day variance in return units
            f_var = (sig_ann / math.sqrt(TRADING_DAYS_CRYPTO)) ** 2 * h
            rv = _realized_var_ahead(returns, t, h)
            if rv is None or rv <= 0:
                continue
            bags[h]["qlike"].append(_qlike(f_var, rv))
            bags[h]["mse"].append((f_var - rv) ** 2)
            bags[h]["mae"].append(abs(f_var - rv))
            bags[h]["bias"].append(f_var - rv)

    horizons_out: dict[str, Any] = {}
    for h in horizons:
        b = bags[h]
        n_o = len(b["qlike"])
        if n_o < 2:
            horizons_out[str(h)] = {"ok": False, "n": n_o}
            continue
        horizons_out[str(h)] = {
            "ok": True,
            "n": n_o,
            "qlike": float(np.mean(b["qlike"])),
            "mse": float(np.mean(b["mse"])),
            "mae": float(np.mean(b["mae"])),
            "bias": float(np.mean(b["bias"])),
            # RMSE on daily-vol equivalent (sqrt mean var err / h) * sqrt(365)
            "rmseAnn": _ann_vol(math.sqrt(float(np.mean(b["mse"])) / h)),
        }

    # Rank score: average QLIKE across successful horizons (lower better)
    qlikes = [v["qlike"] for v in horizons_out.values() if v.get("ok")]
    return {
        "ok": bool(qlikes),
        "horizons": horizons_out,
        "meanQlike": float(np.mean(qlikes)) if qlikes else None,
        "origins": len(origins),
        "stepDays": step,
        "minTrain": min_train,
        "note": (
            "Expanding-window OOS: re-estimate at each origin, forecast h-day variance, "
            "score vs sum of squared log returns. Primary loss = QLIKE (lower is better). "
            "Designed for Deribit option desks comparing model RV to implied vol."
        ),
    }


def get_volatility_suite_payload(
    *,
    days: int = 1095,
    dist: str = "t",
    models: list[str] | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    """Estimate catalog of models and return comparison + series for UI."""
    key = f"vol:suite:v4:{days}:{dist}:{','.join(models or [])}"
    if not refresh:
        cached = _cache_get(key)
        if cached:
            out = dict(cached)
            out["fromCache"] = True
            return out

    data = _load_returns(days=days)
    catalog = MODEL_CATALOG
    if models:
        want = set(models)
        catalog = [m for m in MODEL_CATALOG if m["id"] in want] or MODEL_CATALOG

    results = []
    for m in catalog:
        try:
            fit = _fit_arch(m["id"], m, data, dist)
        except Exception as exc:
            fit = {"ok": False, "error": str(exc)[:240]}
        if fit.get("ok") and fit.get("params"):
            fit["params"] = _annotate_params(fit["params"], m)
            fit["equation"] = m.get("equation")
            fit["equationNote"] = m.get("equationNote")

        # Forecast backtest (option-relevant horizons) — can be slow; keep origins modest
        bt: dict[str, Any] = {"ok": False}
        if fit.get("ok"):
            try:
                bt = _backtest_model(m["id"], m, data, dist)
            except Exception as exc:
                bt = {"ok": False, "error": str(exc)[:160]}

        row = {
            "id": m["id"],
            "name": m["name"],
            "family": m["family"],
            "blurb": m["blurb"],
            "whyBtc": m["whyBtc"],
            "equation": m.get("equation"),
            "equationNote": m.get("equationNote"),
            "status": "ok" if fit.get("ok") else "failed",
            "error": fit.get("error"),
            "warning": fit.get("warning"),
            "fallbackFrom": fit.get("fallbackFrom"),
            "logLikelihood": fit.get("logLikelihood"),
            "aic": fit.get("aic"),
            "bic": fit.get("bic"),
            "hqic": fit.get("hqic"),
            "icComparable": fit.get("icComparable", True) is not False,
            "icNote": fit.get("icNote"),
            "rSquared": fit.get("rSquared"),
            "nParams": fit.get("nParams"),
            "persistence": fit.get("persistence"),
            "halfLifeDays": fit.get("halfLifeDays"),
            "unconditionalVolAnn": fit.get("unconditionalVolAnn"),
            "currentCondVolAnn": fit.get("currentCondVolAnn"),
            "forecastAnn": (fit.get("forecastAnn") or [])[:30],
            "engine": fit.get("engine"),
            "backtest": {
                "ok": bt.get("ok"),
                "meanQlike": bt.get("meanQlike"),
                "horizons": {
                    h: {
                        "qlike": (bt.get("horizons") or {}).get(h, {}).get("qlike"),
                        "rmseAnn": (bt.get("horizons") or {}).get(h, {}).get("rmseAnn"),
                        "n": (bt.get("horizons") or {}).get(h, {}).get("n"),
                    }
                    for h in ("1", "7", "14", "30")
                },
            }
            if bt
            else None,
        }
        # Attach full fit for best / detail
        if fit.get("ok"):
            fit["backtest"] = bt
        row["_fit"] = fit if fit.get("ok") else None
        results.append(row)

    # AIC/BIC leaders: return-likelihood models only (exclude HAR-RV etc.)
    ok_ic = [
        r
        for r in results
        if r["status"] == "ok"
        and r.get("aic") is not None
        and r.get("icComparable", True) is not False
    ]
    best_aic = min(ok_ic, key=lambda r: r["aic"]) if ok_ic else None
    best_bic = (
        min(ok_ic, key=lambda r: r["bic"] if r.get("bic") is not None else 1e99)
        if ok_ic
        else None
    )
    # Best forecast accuracy (lowest mean QLIKE) — valid across GARCH + HAR
    ok_bt = [
        r
        for r in results
        if r["status"] == "ok"
        and r.get("backtest", {}).get("meanQlike") is not None
    ]
    best_qlike = min(ok_bt, key=lambda r: r["backtest"]["meanQlike"]) if ok_bt else None

    # Prefer QLIKE leader for desk detail / RV marks; fall back to AIC among IC-comparable
    detail_row = best_qlike or best_aic

    def _detail(row: dict[str, Any] | None) -> dict[str, Any] | None:
        if not row or not row.get("_fit"):
            return None
        fit = row["_fit"]
        cond = fit.get("condVol") or []
        cur = float(fit.get("currentCondVolAnn") or 0)
        daily = cur / math.sqrt(TRADING_DAYS_CRYPTO) if cur else 0.0
        risk = _var_es(daily, dist)
        return {
            "id": row["id"],
            "name": row["name"],
            "blurb": row["blurb"],
            "whyBtc": row["whyBtc"],
            "equation": row.get("equation") or fit.get("equation"),
            "equationNote": row.get("equationNote") or fit.get("equationNote"),
            "params": fit.get("params"),
            "metrics": {
                "persistence": fit.get("persistence"),
                "halfLifeDays": fit.get("halfLifeDays"),
                "unconditionalVolAnn": fit.get("unconditionalVolAnn"),
                "currentCondVolAnn": fit.get("currentCondVolAnn"),
                "logLikelihood": fit.get("logLikelihood"),
                "aic": fit.get("aic"),
                "bic": fit.get("bic"),
                "rSquared": fit.get("rSquared"),
            },
            "forecastAnn": fit.get("forecastAnn"),
            "condVol": cond,
            "stdResid": fit.get("stdResid"),
            "newsImpact": _news_impact_curve(row["id"], fit),
            "risk": risk,
            "backtest": fit.get("backtest") or row.get("backtest"),
            "regime": _regime_label(cur, fit.get("unconditionalVolAnn")),
            "sizingMultiplier": round(0.55 / cur, 3) if cur > 0.05 else None,
            "warning": fit.get("warning"),
            "engine": fit.get("engine"),
            "distribution": fit.get("distribution") or dist,
            "deribitNote": (
                "Most BTC options flow on Deribit. Compare this model’s RV forecast to Deribit DVOL / "
                "option-implied vol for the matching expiry: model_RV ≪ IV often means rich vol premium; "
                "model_RV ≫ IV can flag cheap options (after jump risk and term-structure checks)."
            ),
        }

    best_detail = _detail(detail_row)

    # Price / returns series for charts (downsample if huge)
    n = data["n"]
    step = max(1, n // 1200)
    series = {
        "dates": data["dates"][::step],
        "close": data["close"][::step].tolist(),
        "returns": data["returns"][::step].tolist(),
    }
    if best_detail and best_detail.get("condVol"):
        cv = best_detail["condVol"]
        best_detail["condVol"] = cv[::step] if len(cv) == n else cv
        sr = best_detail.get("stdResid") or []
        if len(sr) == n:
            best_detail["stdResid"] = sr[::step]

    # Comparison table without heavy arrays
    table = []
    for r in results:
        table.append({k: v for k, v in r.items() if k != "_fit"})

    payload = {
        "asOf": _now_iso(),
        "pair": data["pair"],
        "source": data["source"],
        "startDate": data["startDate"],
        "endDate": data["endDate"],
        "nObs": data["n"],
        "daysRequested": days,
        "distribution": dist,
        "archAvailable": ARCH_AVAILABLE,
        "annualization": "sqrt(365)",
        "models": table,
        "bestByAic": best_aic["id"] if best_aic else None,
        "bestByBic": best_bic["id"] if best_bic else None,
        "bestByQlike": best_qlike["id"] if best_qlike else None,
        "icRankingNote": (
            "AIC/BIC rank only return-likelihood GARCH-family fits. "
            "HAR-RV uses a Gaussian IC on the RV residual and is excluded from AIC/BIC badges."
        ),
        "summary": {
            "currentCondVolAnn": best_detail.get("metrics", {}).get("currentCondVolAnn")
            if best_detail
            else None,
            "forecast1d": (best_detail.get("forecastAnn") or [None])[0] if best_detail else None,
            "forecast7d": (best_detail.get("forecastAnn") or [None] * 7)[6] if best_detail else None,
            "forecast30d": (best_detail.get("forecastAnn") or [None] * 30)[29] if best_detail else None,
            "bestModelName": best_aic["name"] if best_aic else None,
            "bestModelId": best_aic["id"] if best_aic else None,
            "markModelName": (detail_row or {}).get("name") if detail_row else None,
            "markModelId": (detail_row or {}).get("id") if detail_row else None,
            "bestForecastModelName": best_qlike["name"] if best_qlike else None,
            "bestForecastModelId": best_qlike["id"] if best_qlike else None,
            "bestForecastQlike": best_qlike["backtest"]["meanQlike"] if best_qlike else None,
            "persistence": best_detail.get("metrics", {}).get("persistence") if best_detail else None,
            "halfLifeDays": best_detail.get("metrics", {}).get("halfLifeDays") if best_detail else None,
            "unconditionalVolAnn": best_detail.get("metrics", {}).get("unconditionalVolAnn") if best_detail else None,
            "regime": best_detail.get("regime") if best_detail else None,
        },
        "detail": best_detail,
        "series": series,
        "guide": [
            {
                "prefer": "EGARCH / GJR-GARCH",
                "when": "You care about crash asymmetry (dumps lifting vol more than pumps).",
            },
            {
                "prefer": "FIGARCH",
                "when": "Vol shocks seem to decay slowly over weeks (long memory).",
            },
            {
                "prefer": "HAR-RV",
                "when": "You want a robust forecast benchmark from OHLC without full GARCH MLE.",
            },
            {
                "prefer": "GARCH(1,1)",
                "when": "Baseline / communication with desks; always report alongside asymmetric models.",
            },
        ],
        "glossary": {
            "conditionalVol": "Model-implied expected volatility given information up to t-1 (not historical window stdev).",
            "persistence": "How slowly variance mean-reverts (α+β near 1 ⇒ long-lived shocks).",
            "halfLife": "Days until a variance shock decays to half its impact (approx).",
            "QLIKE": "Preferred loss for comparing volatility forecasts (asymmetric).",
            "newsImpact": "How a positive vs negative return of equal size changes next-period variance.",
            "AIC": (
                "Akaike IC on the model likelihood. GARCH family: return likelihood. "
                "HAR-RV: RV-residual likelihood — not comparable across those two classes."
            ),
        },
        "fromCache": False,
    }
    _cache_set(key, payload)
    return payload


def get_volatility_model_payload(
    model_id: str,
    *,
    days: int = 1095,
    dist: str = "t",
    refresh: bool = False,
) -> dict[str, Any]:
    suite = get_volatility_suite_payload(days=days, dist=dist, models=[model_id], refresh=refresh)
    # Re-run single with full arrays (no downsample for detail endpoint)
    data = _load_returns(days=days)
    cat = next((m for m in MODEL_CATALOG if m["id"] == model_id), None)
    if not cat:
        raise ValueError(f"Unknown model: {model_id}")
    fit = _fit_arch(model_id, cat, data, dist)
    if not fit.get("ok"):
        return {
            "ok": False,
            "error": fit.get("error"),
            "model": cat,
            "archAvailable": ARCH_AVAILABLE,
        }
    fit["params"] = _annotate_params(fit.get("params") or [], cat)
    fit["equation"] = cat.get("equation")
    fit["equationNote"] = cat.get("equationNote")
    try:
        fit["backtest"] = _backtest_model(model_id, cat, data, dist)
    except Exception as exc:
        fit["backtest"] = {"ok": False, "error": str(exc)[:160]}
    cur = float(fit.get("currentCondVolAnn") or 0)
    daily = cur / math.sqrt(TRADING_DAYS_CRYPTO) if cur else 0.0
    return {
        "ok": True,
        "asOf": _now_iso(),
        "model": {
            "id": cat["id"],
            "name": cat["name"],
            "family": cat["family"],
            "blurb": cat["blurb"],
            "whyBtc": cat["whyBtc"],
            "equation": cat.get("equation"),
            "equationNote": cat.get("equationNote"),
        },
        "fit": {
            **{k: v for k, v in fit.items()},
            "newsImpact": _news_impact_curve(model_id, fit),
            "risk": _var_es(daily, dist),
            "regime": _regime_label(cur, fit.get("unconditionalVolAnn")),
            "sizingMultiplier": round(0.55 / cur, 3) if cur > 0.05 else None,
            "deribitNote": (
                "Deribit is the primary BTC options venue. Map this model’s h-day RV forecast to the "
                "option expiry’s remaining calendar days and compare to mid IV / DVOL: "
                "IV − model_RV is a rough vol risk premium (positive = options rich vs model)."
            ),
        },
        "series": {
            "dates": data["dates"],
            "close": data["close"].tolist(),
            "returns": data["returns"].tolist(),
        },
        "archAvailable": ARCH_AVAILABLE,
        "distribution": dist,
        "daysRequested": days,
    }
