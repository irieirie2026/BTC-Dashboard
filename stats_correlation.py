"""BTC multi-asset correlation suite — Stats → Statistics → Correlation.

Pearson correlations of daily log returns (Yahoo Finance via yfinance + BTC).
"""

from __future__ import annotations

import math
import time
from datetime import datetime, timezone
from typing import Any

import numpy as np

try:
    import yfinance as yf  # type: ignore

    YF_AVAILABLE = True
except Exception:
    yf = None  # type: ignore
    YF_AVAILABLE = False

try:
    from macro_data.cache import cache_get, cache_set
except Exception:  # pragma: no cover
    _MEM: dict[str, tuple[float, Any]] = {}

    def cache_get(key: str, ttl: int = 300):  # type: ignore
        row = _MEM.get(key)
        if not row:
            return None
        ts, val = row
        if time.time() - ts > ttl:
            return None
        return val

    def cache_set(key: str, val: Any, ttl: int = 300):  # type: ignore
        _MEM[key] = (time.time(), val)


CACHE_TTL = 900  # 15 min

# Flagship cross-asset book vs BTC
ASSET_BOOK: list[dict[str, str]] = [
    {"id": "BTC", "ticker": "BTC-USD", "name": "Bitcoin", "group": "crypto"},
    {"id": "ETH", "ticker": "ETH-USD", "name": "Ethereum", "group": "crypto"},
    {"id": "SOL", "ticker": "SOL-USD", "name": "Solana", "group": "crypto"},
    {"id": "SPY", "ticker": "SPY", "name": "S&P 500", "group": "equity"},
    {"id": "QQQ", "ticker": "QQQ", "name": "Nasdaq-100", "group": "equity"},
    {"id": "DIA", "ticker": "DIA", "name": "Dow Jones", "group": "equity"},
    {"id": "IWM", "ticker": "IWM", "name": "Russell 2000", "group": "equity"},
    {"id": "EEM", "ticker": "EEM", "name": "EM equities", "group": "equity"},
    {"id": "GLD", "ticker": "GLD", "name": "Gold", "group": "commodity"},
    {"id": "SLV", "ticker": "SLV", "name": "Silver", "group": "commodity"},
    {"id": "USO", "ticker": "USO", "name": "Oil", "group": "commodity"},
    {"id": "TLT", "ticker": "TLT", "name": "US long bonds", "group": "rates"},
    {"id": "HYG", "ticker": "HYG", "name": "High yield", "group": "rates"},
    {"id": "UUP", "ticker": "UUP", "name": "US Dollar", "group": "fx"},
    {"id": "VIX", "ticker": "^VIX", "name": "VIX", "group": "vol"},
    {"id": "AAPL", "ticker": "AAPL", "name": "Apple", "group": "stock"},
    {"id": "MSFT", "ticker": "MSFT", "name": "Microsoft", "group": "stock"},
    {"id": "NVDA", "ticker": "NVDA", "name": "Nvidia", "group": "stock"},
    {"id": "TSLA", "ticker": "TSLA", "name": "Tesla", "group": "stock"},
    {"id": "AMZN", "ticker": "AMZN", "name": "Amazon", "group": "stock"},
    {"id": "GOOGL", "ticker": "GOOGL", "name": "Alphabet", "group": "stock"},
    {"id": "META", "ticker": "META", "name": "Meta", "group": "stock"},
    {"id": "MSTR", "ticker": "MSTR", "name": "MicroStrategy", "group": "stock"},
    {"id": "COIN", "ticker": "COIN", "name": "Coinbase", "group": "stock"},
]

# Rolling windows in trading days (≈252/year for equities; crypto calendar is denser)
# UI labels: 1y / 2y / 3y / 5y / all (expanding)
ROLL_WINDOWS: tuple[int | str, ...] = (365, 730, 1095, 1825, "all")
ROLL_WINDOW_META = [
    {"id": "365", "days": 365, "label": "1 year"},
    {"id": "730", "days": 730, "label": "2 years"},
    {"id": "1095", "days": 1095, "label": "3 years"},
    {"id": "1825", "days": 1825, "label": "5 years"},
    {"id": "all", "days": None, "label": "All (expanding)"},
]
# Same options for the static correlation matrix sample length
MATRIX_SAMPLE_META = [
    {"id": "365", "days": 365, "label": "1 year"},
    {"id": "730", "days": 730, "label": "2 years"},
    {"id": "1095", "days": 1095, "label": "3 years"},
    {"id": "1825", "days": 1825, "label": "5 years"},
    {"id": "all", "days": None, "label": "All"},
]
EXPANDING_MIN_OBS = 90  # min days before first expanding ρ
ROLL_MAX_POINTS = 1800  # denser full-history chart
MATRIX_MIN_OBS = 30


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _safe_float(x: Any) -> float | None:
    try:
        v = float(x)
        if math.isfinite(v):
            return v
    except (TypeError, ValueError):
        pass
    return None


def _pearson(a: np.ndarray, b: np.ndarray) -> float | None:
    if len(a) < 10 or len(b) < 10 or len(a) != len(b):
        return None
    if np.std(a) < 1e-12 or np.std(b) < 1e-12:
        return None
    c = np.corrcoef(a, b)[0, 1]
    return _safe_float(c)


def _rolling_corr(btc: np.ndarray, other: np.ndarray, window: int) -> list[float | None]:
    """Fixed-window rolling Pearson (pandas when available)."""
    n = len(btc)
    if n < max(window, 10) or window < 10:
        return [None] * n
    try:
        import pandas as pd  # type: ignore

        s1 = pd.Series(btc, dtype=float)
        s2 = pd.Series(other, dtype=float)
        series = s1.rolling(window, min_periods=window).corr(s2)
        out: list[float | None] = []
        for v in series.tolist():
            out.append(_safe_float(v))
        return out
    except Exception:
        out = [None] * n
        for i in range(window - 1, n):
            a = btc[i - window + 1 : i + 1]
            b = other[i - window + 1 : i + 1]
            if not (np.all(np.isfinite(a)) and np.all(np.isfinite(b))):
                continue
            out[i] = _pearson(a, b)
        return out


def _expanding_corr(btc: np.ndarray, other: np.ndarray, min_obs: int = EXPANDING_MIN_OBS) -> list[float | None]:
    """Expanding (all-history-to-date) Pearson ρ from the start of the sample."""
    n = len(btc)
    if n < min_obs:
        return [None] * n
    try:
        import pandas as pd  # type: ignore

        s1 = pd.Series(btc, dtype=float)
        s2 = pd.Series(other, dtype=float)
        series = s1.expanding(min_periods=min_obs).corr(s2)
        return [_safe_float(v) for v in series.tolist()]
    except Exception:
        out: list[float | None] = [None] * n
        for i in range(min_obs - 1, n):
            out[i] = _pearson(btc[: i + 1], other[: i + 1])
        return out


def _downsample(
    dates: list[str],
    values: list[float | None],
    max_pts: int = ROLL_MAX_POINTS,
) -> tuple[list[str], list[float | None]]:
    n = len(dates)
    if n <= max_pts:
        return dates, values
    step = max(1, int(math.ceil(n / max_pts)))
    idx = list(range(0, n, step))
    if idx[-1] != n - 1:
        idx.append(n - 1)
    return [dates[i] for i in idx], [values[i] for i in idx]


def _download_closes(tickers: list[str], period: str = "max") -> dict[str, dict[str, float]]:
    """Return {ticker: {YYYY-MM-DD: close}}."""
    out: dict[str, dict[str, float]] = {t: {} for t in tickers}
    if not YF_AVAILABLE or yf is None or not tickers:
        return out
    try:
        data = yf.download(
            tickers=tickers,
            period=period,
            interval="1d",
            group_by="ticker",
            auto_adjust=True,
            threads=True,
            progress=False,
        )
    except Exception:
        # fallback one-by-one
        for t in tickers:
            try:
                hist = yf.Ticker(t).history(period=period, auto_adjust=True)
                if hist is None or hist.empty:
                    continue
                for idx, row in hist.iterrows():
                    try:
                        d = idx.strftime("%Y-%m-%d")
                    except Exception:
                        d = str(idx)[:10]
                    c = row.get("Close")
                    if c is not None and math.isfinite(float(c)):
                        out[t][d] = float(c)
            except Exception:
                continue
        return out

    # yfinance multi-ticker shape varies
    try:
        if len(tickers) == 1:
            t = tickers[0]
            if "Close" in data.columns:
                for idx, val in data["Close"].items():
                    if val is None or (isinstance(val, float) and not math.isfinite(val)):
                        continue
                    try:
                        d = idx.strftime("%Y-%m-%d")
                    except Exception:
                        d = str(idx)[:10]
                    out[t][d] = float(val)
            return out

        # MultiIndex columns (ticker, field) or (field, ticker)
        cols = data.columns
        if hasattr(cols, "levels") and cols.nlevels == 2:
            # detect orientation
            level0 = list(cols.get_level_values(0).unique())
            if "Close" in level0 or "Adj Close" in level0:
                field = "Close" if "Close" in level0 else "Adj Close"
                for t in tickers:
                    try:
                        series = data[field][t] if field in level0 else data[t]["Close"]
                    except Exception:
                        try:
                            series = data[t]["Close"]
                        except Exception:
                            continue
                    for idx, val in series.items():
                        try:
                            fv = float(val)
                        except (TypeError, ValueError):
                            continue
                        if not math.isfinite(fv):
                            continue
                        try:
                            d = idx.strftime("%Y-%m-%d")
                        except Exception:
                            d = str(idx)[:10]
                        out[t][d] = fv
            else:
                for t in tickers:
                    try:
                        series = data[t]["Close"]
                    except Exception:
                        continue
                    for idx, val in series.items():
                        try:
                            fv = float(val)
                        except (TypeError, ValueError):
                            continue
                        if not math.isfinite(fv):
                            continue
                        try:
                            d = idx.strftime("%Y-%m-%d")
                        except Exception:
                            d = str(idx)[:10]
                        out[t][d] = fv
    except Exception:
        pass
    return out


def get_correlation_payload(*, refresh: bool = False, period: str = "max") -> dict[str, Any]:
    period = (period or "max").strip().lower()
    if period not in ("2y", "5y", "10y", "max"):
        period = "max"
    key = f"stats:corr:v4:{period}"
    if not refresh:
        cached = cache_get(key, ttl=CACHE_TTL)
        if cached is not None:
            out = dict(cached)
            out["fromCache"] = True
            return out

    if not YF_AVAILABLE:
        return {
            "ok": False,
            "error": "yfinance not installed — run: pip install yfinance",
            "yfinanceAvailable": False,
            "assets": ASSET_BOOK,
            "labels": [],
            "ids": [],
            "matrix": [],
            "btcPairs": [],
            "rolling": {
                "windows": [str(w) for w in ROLL_WINDOWS],
                "windowMeta": ROLL_WINDOW_META,
                "byAsset": {},
            },
            "asOf": _now_iso(),
        }

    tickers = [a["ticker"] for a in ASSET_BOOK]
    closes_by_ticker = _download_closes(tickers, period=period)

    # Map id → date→close
    series: dict[str, dict[str, float]] = {}
    for a in ASSET_BOOK:
        series[a["id"]] = closes_by_ticker.get(a["ticker"]) or {}

    # Common calendar = all dates that appear for BTC (crypto 7d) ∪ equities
    all_dates = sorted({d for s in series.values() for d in s.keys()})
    if len(all_dates) < 60:
        return {
            "ok": False,
            "error": "Insufficient price history downloaded",
            "yfinanceAvailable": True,
            "assets": ASSET_BOOK,
            "asOf": _now_iso(),
        }

    ids = [a["id"] for a in ASSET_BOOK if len(series.get(a["id"]) or {}) >= 60]
    # Ensure BTC first
    if "BTC" in ids:
        ids = ["BTC"] + [i for i in ids if i != "BTC"]
    labels = []
    id_to_name = {a["id"]: a["name"] for a in ASSET_BOOK}
    for i in ids:
        labels.append(id_to_name.get(i, i))

    # Build aligned close matrix on BTC trading days (crypto calendar)
    btc_dates = sorted(series.get("BTC", {}).keys())
    if len(btc_dates) < 60:
        # fall back to intersection of any dense series
        btc_dates = all_dates

    # Forward-fill equities onto crypto calendar for display; for returns use
    # only days where both have a fresh print when possible.
    # Practical approach: build daily returns on each asset's own calendar,
    # then align return series by date for pairwise ops.

    ret_by_id: dict[str, dict[str, float]] = {}
    for aid in ids:
        closes = series.get(aid) or {}
        ds = sorted(closes.keys())
        rets: dict[str, float] = {}
        for j in range(1, len(ds)):
            c0, c1 = closes[ds[j - 1]], closes[ds[j]]
            if c0 > 0 and c1 > 0:
                rets[ds[j]] = math.log(c1 / c0)
        ret_by_id[aid] = rets

    def _pair_slice(
        di: dict[str, float],
        dj: dict[str, float],
        lookback: int | None,
    ) -> tuple[np.ndarray, np.ndarray, list[str]]:
        common = sorted(set(di.keys()) & set(dj.keys()))
        if lookback is not None and lookback > 0 and len(common) > lookback:
            common = common[-lookback:]
        if len(common) < MATRIX_MIN_OBS:
            return np.array([]), np.array([]), common
        va = np.array([di[d] for d in common], dtype=float)
        vb = np.array([dj[d] for d in common], dtype=float)
        return va, vb, common

    def _build_matrix(lookback: int | None) -> tuple[list[list[float | None]], list[list[int]]]:
        nn = len(ids)
        mat: list[list[float | None]] = [[None] * nn for _ in range(nn)]
        nobs: list[list[int]] = [[0] * nn for _ in range(nn)]
        for i, ai in enumerate(ids):
            mat[i][i] = 1.0
            di = ret_by_id.get(ai) or {}
            nobs[i][i] = min(len(di), lookback) if lookback else len(di)
            for j in range(i + 1, nn):
                aj = ids[j]
                va, vb, common = _pair_slice(
                    di, ret_by_id.get(aj) or {}, lookback
                )
                if len(common) < MATRIX_MIN_OBS:
                    continue
                c = _pearson(va, vb)
                mat[i][j] = c
                mat[j][i] = c
                nobs[i][j] = len(common)
                nobs[j][i] = len(common)
        return mat, nobs

    def _btc_pairs_for(lookback: int | None) -> list[dict[str, Any]]:
        btc = ret_by_id.get("BTC") or {}
        rows: list[dict[str, Any]] = []
        for aid in ids:
            if aid == "BTC":
                continue
            other = ret_by_id.get(aid) or {}
            va, vb, common = _pair_slice(btc, other, lookback)
            group = next((a["group"] for a in ASSET_BOOK if a["id"] == aid), "")
            if len(common) < MATRIX_MIN_OBS:
                rows.append(
                    {
                        "id": aid,
                        "name": id_to_name.get(aid, aid),
                        "group": group,
                        "corr": None,
                        "corr90": None,
                        "nObs": len(common),
                    }
                )
                continue
            full = _pearson(va, vb)
            tail = common[-90:] if len(common) >= 90 else common
            c90 = _pearson(
                np.array([btc[d] for d in tail], dtype=float),
                np.array([other[d] for d in tail], dtype=float),
            )
            rows.append(
                {
                    "id": aid,
                    "name": id_to_name.get(aid, aid),
                    "group": group,
                    "corr": full,
                    "corr90": c90,
                    "nObs": len(common),
                }
            )
        rows.sort(key=lambda r: abs(r["corr"] or 0), reverse=True)
        return rows

    # Matrices for each sample length (1y / 2y / 3y / 5y / all)
    matrices: dict[str, Any] = {}
    for meta in MATRIX_SAMPLE_META:
        sid = meta["id"]
        look = meta["days"]
        mat, nobs = _build_matrix(look)
        matrices[sid] = {
            "id": sid,
            "label": meta["label"],
            "days": look,
            "matrix": mat,
            "nObsMatrix": nobs,
            "btcPairs": _btc_pairs_for(look),
        }

    # Default / legacy fields = full sample ("all")
    matrix = matrices["all"]["matrix"]
    n_obs_mat = matrices["all"]["nObsMatrix"]
    btc_pairs = matrices["all"]["btcPairs"]
    btc_ret = ret_by_id.get("BTC") or {}

    # Rolling BTC vs each asset on full intersection calendar (back to first overlap)
    rolling_by_asset: dict[str, dict[str, dict[str, list]]] = {}
    for aid in ids:
        if aid == "BTC":
            continue
        other = ret_by_id.get(aid) or {}
        common = sorted(set(btc_ret.keys()) & set(other.keys()))
        if len(common) < EXPANDING_MIN_OBS:
            continue
        btc_arr = np.array([btc_ret[d] for d in common], dtype=float)
        oth_arr = np.array([other[d] for d in common], dtype=float)
        asset_roll: dict[str, dict[str, list]] = {}
        for w in ROLL_WINDOWS:
            if w == "all":
                vals = _expanding_corr(btc_arr, oth_arr, EXPANDING_MIN_OBS)
                wkey = "all"
            else:
                w_int = int(w)
                if len(common) < w_int:
                    # still store empty so UI can show "need more history"
                    asset_roll[str(w_int)] = {"dates": [], "values": []}
                    continue
                vals = _rolling_corr(btc_arr, oth_arr, w_int)
                wkey = str(w_int)
            dates_w: list[str] = []
            vals_w: list[float | None] = []
            for d, v in zip(common, vals):
                if v is None:
                    continue
                dates_w.append(d)
                vals_w.append(v)
            # Keep full span from first valid ρ to last sample (downsample density only)
            dates_w, vals_w = _downsample(dates_w, vals_w, ROLL_MAX_POINTS)
            asset_roll[wkey] = {
                "dates": dates_w,
                "values": vals_w,
                "startDate": dates_w[0] if dates_w else None,
                "endDate": dates_w[-1] if dates_w else None,
                "nPoints": len(dates_w),
            }
        rolling_by_asset[aid] = asset_roll

    # Date range from BTC
    btc_ds = sorted(btc_ret.keys())
    start = btc_ds[0] if btc_ds else None
    end = btc_ds[-1] if btc_ds else None

    payload = {
        "ok": True,
        "asOf": _now_iso(),
        "yfinanceAvailable": True,
        "fromCache": False,
        "method": "Pearson correlation of daily log returns (close-to-close)",
        "period": period,
        "startDate": start,
        "endDate": end,
        "nBtcObs": len(btc_ret),
        "assets": [
            {**a, "nObs": len(ret_by_id.get(a["id"]) or {})}
            for a in ASSET_BOOK
            if a["id"] in ids
        ],
        "ids": ids,
        "labels": labels,
        "matrix": matrix,
        "nObsMatrix": n_obs_mat,
        "btcPairs": btc_pairs,
        "matrixSamples": {
            "default": "all",
            "options": MATRIX_SAMPLE_META,
            "bySample": matrices,
        },
        "rolling": {
            "windows": [str(w) for w in ROLL_WINDOWS],
            "windowMeta": ROLL_WINDOW_META,
            "byAsset": rolling_by_asset,
        },
        "guide": [
            "ρ near +1: asset moves with BTC on the same days.",
            "ρ near 0: little linear co-movement (still can jump together in crises).",
            "ρ near −1: tends to move opposite BTC (rare and unstable for risk assets).",
            "Equities trade weekdays only — weekend BTC moves are not in equity correlations.",
            "Matrix sample = trailing 1y–5y or All. Rolling chart: same lengths; All = expanding ρ.",
        ],
    }
    cache_set(key, payload, ttl=CACHE_TTL)
    return payload
