"""Computed Bitcoin valuation model series (price-derived and local math)."""

from __future__ import annotations

import math
import time
from typing import Any

PL_GENESIS_TS = int(time.mktime(time.strptime("2009-01-03", "%Y-%m-%d")))
PL_A = math.pow(10, -16.493)
PL_N = 5.68
PL_BEAR_MULT = 0.4
PL_BULL_MULT = 1.5

# Plan B S2F regression (approximate; educational)
S2F_A = 3.31954
S2F_B = 1.84

HALVING_DATES = [
    "2012-11-28",
    "2016-07-09",
    "2020-05-11",
    "2024-04-20",
]

RAINBOW_BANDS = [
    (0.0, "#9ca3af", "Maximum bubble"),
    (0.15, "#22c55e", "Sell seriously"),
    (0.30, "#84cc16", "FOMO intensifies"),
    (0.45, "#eab308", "HODL"),
    (0.60, "#f97316", "Still cheap"),
    (0.75, "#ef4444", "Accumulate"),
    (0.90, "#a855f7", "BUY"),
    (1.05, "#3b82f6", "Fire sale"),
]


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _days_since_genesis(ts: int) -> float:
    return max(1.0, (ts - PL_GENESIS_TS) / 86400.0)


def _sma(values: list[float | None], window: int) -> list[float | None]:
    out: list[float | None] = []
    for i in range(len(values)):
        if i + 1 < window:
            out.append(None)
            continue
        window_vals = [v for v in values[i + 1 - window : i + 1] if v is not None]
        if len(window_vals) < window:
            out.append(None)
        else:
            out.append(sum(window_vals) / len(window_vals))
    return out


def _subsidy_btc_at_date(date_str: str) -> float:
    """Block subsidy in BTC (pre-fee) by halving era."""
    try:
        ts = int(time.mktime(time.strptime(date_str[:10], "%Y-%m-%d")))
    except (ValueError, OverflowError):
        return 3.125
    halving_ts = [int(time.mktime(time.strptime(d, "%Y-%m-%d"))) for d in HALVING_DATES]
    subsidy = 50.0
    for h in halving_ts:
        if ts >= h:
            subsidy /= 2
    return subsidy


def _annual_flow_btc(date_str: str) -> float:
    return _subsidy_btc_at_date(date_str) * 144 * 365


def _stock_estimate(date_str: str, supply: float | None) -> float:
    if supply and supply > 0:
        return supply
    try:
        ts = int(time.mktime(time.strptime(date_str[:10], "%Y-%m-%d")))
    except (ValueError, OverflowError):
        return 19_000_000.0
    days = (ts - PL_GENESIS_TS) / 86400.0
    return min(21_000_000.0, max(0.0, days * 50 * 144 * 0.55))


def series_to_chart(
    points: list[dict[str, Any]],
    *,
    source: str,
    unit: str = "",
    note: str = "",
) -> dict[str, Any]:
    clean = [p for p in points if p.get("value") is not None]
    latest = clean[-1] if clean else None
    return {
        "series": clean,
        "latest": latest,
        "source": source,
        "unit": unit,
        "note": note,
        "fetchedAt": _now_iso(),
    }


def compute_stock_to_flow(
    price_series: list[dict],
    supply_series: list[dict] | None = None,
) -> dict[str, Any]:
    supply_by_date = {p.get("date"): p.get("value") for p in (supply_series or []) if p.get("date")}
    out: list[dict] = []
    for pt in price_series:
        date = pt.get("date") or ""
        ts = pt.get("timestamp")
        price = pt.get("value")
        if price is None or not date:
            continue
        stock = _stock_estimate(date, supply_by_date.get(date))
        flow = _annual_flow_btc(date)
        if flow <= 0:
            continue
        sf = stock / flow
        model_price = math.exp(S2F_A + S2F_B * math.log(sf)) if sf > 0 else None
        out.append({
            "timestamp": ts,
            "date": date,
            "value": round(sf, 3),
            "price": float(price),
            "model_price": round(model_price, 2) if model_price else None,
        })
    return series_to_chart(out, source="Computed · halving schedule + price", unit="×", note="S2F ratio; model price in hover")


def compute_stock_to_flow_cross(price_series: list[dict], supply_series: list[dict] | None = None) -> dict[str, Any]:
    """S2FX-style phase coloring via halving-era transitions."""
    base = compute_stock_to_flow(price_series, supply_series)
    phases = []
    for pt in base.get("series") or []:
        date = pt.get("date", "")
        phase = 1
        for i, h in enumerate(HALVING_DATES):
            if date >= h:
                phase = min(4, i + 2)
        phases.append({**pt, "phase": phase})
    payload = dict(base)
    payload["series"] = phases
    payload["note"] = "S2F ratio with halving-era phase tags (S2FX-style)"
    payload["source"] = "Computed · PlanB S2FX phases"
    return payload


def compute_power_law(price_series: list[dict]) -> dict[str, Any]:
    out: list[dict] = []
    multi: list[dict] = []
    for pt in price_series:
        ts = pt.get("timestamp")
        price = pt.get("value")
        if price is None or not ts:
            continue
        days = _days_since_genesis(int(ts))
        fair = PL_A * math.pow(days, PL_N)
        ratio = float(price) / fair if fair > 0 else None
        out.append({
            "timestamp": ts,
            "date": pt.get("date"),
            "value": round(ratio, 4) if ratio else None,
            "price": float(price),
            "fair": round(fair, 2),
            "support": round(fair * PL_BEAR_MULT, 2),
            "resistance": round(fair * PL_BULL_MULT, 2),
        })
        multi.append({
            "timestamp": ts,
            "date": pt.get("date"),
            "price": float(price),
            "fair": round(fair, 2),
        })
    payload = series_to_chart(out, source="Computed · Santostasi power law", unit="×", note="Price/fair ratio; see Stats → Power Law")
    payload["overlay"] = multi
    return payload


def compute_pi_cycle(price_series: list[dict]) -> dict[str, Any]:
    prices = [float(p["value"]) if p.get("value") is not None else None for p in price_series]
    ma111 = _sma(prices, 111)
    ma350x2 = [v * 2 if v is not None else None for v in _sma(prices, 350)]
    out: list[dict] = []
    overlay: list[dict] = []
    for i, pt in enumerate(price_series):
        ts = pt.get("timestamp")
        price = pt.get("value")
        if price is None:
            continue
        signal = 1 if (ma111[i] is not None and ma350x2[i] is not None and ma111[i] > ma350x2[i]) else 0
        out.append({
            "timestamp": ts,
            "date": pt.get("date"),
            "value": signal,
            "price": float(price),
            "ma111": round(ma111[i], 2) if ma111[i] else None,
            "ma350x2": round(ma350x2[i], 2) if ma350x2[i] else None,
        })
        overlay.append({
            "timestamp": ts,
            "date": pt.get("date"),
            "price": float(price),
            "ma111": ma111[i],
            "ma350x2": ma350x2[i],
        })
    active = out[-1].get("value") == 1 if out else False
    payload = series_to_chart(out, source="Computed · daily close", unit="signal", note="111DMA vs 350DMA×2 cross")
    if payload.get("latest"):
        payload["latest"]["value"] = 1 if active else 0
        payload["latest"]["label"] = "Cross active" if active else "No cross"
    payload["overlay"] = overlay
    payload["signals"] = [p for p in out if p.get("value") == 1]
    return payload


def compute_rainbow(price_series: list[dict]) -> dict[str, Any]:
    """Log-linear regression bands on price (educational rainbow chart)."""
    valid = [(i, p) for i, p in enumerate(price_series) if p.get("value") and p.get("timestamp")]
    if len(valid) < 30:
        return series_to_chart([], source="Computed", note="Insufficient price history")

    xs = [math.log(_days_since_genesis(int(p["timestamp"]))) for _, p in valid]
    ys = [math.log(float(p["value"])) for _, p in valid]
    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
    den = sum((xs[i] - mean_x) ** 2 for i in range(n))
    b = num / den if den else 0
    a = mean_y - b * mean_x

    out: list[dict] = []
    bands: list[dict] = []
    for _, pt in valid:
        days = _days_since_genesis(int(pt["timestamp"]))
        log_fair = a + b * math.log(days)
        fair = math.exp(log_fair)
        price = float(pt["value"])
        # band index 0–7 from deviation vs regression
        dev = (math.log(price) - log_fair) / 0.35 if price > 0 else 0
        band_idx = max(0, min(len(RAINBOW_BANDS) - 1, int((dev + 2) / 0.5)))
        out.append({
            "timestamp": pt["timestamp"],
            "date": pt.get("date"),
            "value": round(price, 2),
            "fair": round(fair, 2),
            "band": band_idx,
        })
        bands.append({"fair": fair, "band": band_idx})
    payload = series_to_chart(out, source="Computed · log regression bands", unit="USD")
    payload["bands"] = RAINBOW_BANDS
    return payload


def compute_hash_ribbons(hashrate_series: list[dict]) -> dict[str, Any]:
    """Hash ribbon signal from 30d/60d hash-rate SMA cross (Charles Edwards method)."""
    vals = [
        float(p["value"]) if p.get("value") is not None else None
        for p in hashrate_series
    ]
    ma30 = _sma(vals, 30)
    ma60 = _sma(vals, 60)
    in_capitulation = False
    out: list[dict] = []
    for i, pt in enumerate(hashrate_series):
        short_ma = ma30[i]
        long_ma = ma60[i]
        if short_ma is None or long_ma is None:
            signal = 0.0
        elif short_ma < long_ma:
            in_capitulation = True
            signal = -1.0
        elif in_capitulation and short_ma > long_ma:
            signal = 1.0
            in_capitulation = False
        else:
            signal = 0.0
        out.append({
            "timestamp": pt.get("timestamp"),
            "date": pt.get("date"),
            "value": signal,
        })
    return series_to_chart(
        out,
        source="Computed · hash-rate MAs (30d/60d)",
        unit="signal",
        note="Derived from cached hash rate when BGeometrics hashribbons is unavailable",
    )


def compute_difficulty_ribbon(difficulty_series: list[dict]) -> dict[str, Any]:
    vals = [float(p["value"]) if p.get("value") is not None else None for p in difficulty_series]
    windows = [9, 14, 25, 40, 60, 128, 200]
    smas = {w: _sma(vals, w) for w in windows}
    out: list[dict] = []
    for i, pt in enumerate(difficulty_series):
        ts = pt.get("timestamp")
        val = pt.get("value")
        if val is None:
            continue
        ribbon_vals = [smas[w][i] for w in windows if smas[w][i] is not None]
        spread = (max(ribbon_vals) - min(ribbon_vals)) / val if ribbon_vals and val else None
        out.append({
            "timestamp": ts,
            "date": pt.get("date"),
            "value": float(val),
            "ribbon_spread": round(spread, 4) if spread is not None else None,
        })
    payload = series_to_chart(out, source="Computed · BGeometrics difficulty", unit="difficulty")
    payload["smas"] = {str(w): [] for w in windows}
    for i, pt in enumerate(difficulty_series):
        if pt.get("value") is None:
            continue
        for w in windows:
            v = smas[w][i]
            if v is not None:
                payload["smas"][str(w)].append({
                    "timestamp": pt["timestamp"],
                    "date": pt.get("date"),
                    "value": v,
                })
    return payload


def compute_metcalfe(address_series: list[dict], price_series: list[dict]) -> dict[str, Any]:
    addr_by_ts = {p.get("timestamp"): p.get("value") for p in address_series}
    out: list[dict] = []
    for pt in price_series:
        ts = pt.get("timestamp")
        price = pt.get("value")
        addr = addr_by_ts.get(ts)
        if price is None or addr is None or addr <= 0:
            continue
        metcalfe = (float(addr) ** 2) / 1e12
        ratio = float(price) / metcalfe if metcalfe > 0 else None
        out.append({
            "timestamp": ts,
            "date": pt.get("date"),
            "value": round(ratio, 4) if ratio else None,
            "price": float(price),
            "metcalfe_fair": round(metcalfe, 2),
            "addresses": float(addr),
        })
    return series_to_chart(
        out,
        source="Computed · addresses² vs price",
        unit="×",
        note="Price / (active addresses²) — educational Metcalfe proxy",
    )


def compute_balanced_price(
    realized_series: list[dict],
    delta_cap_series: list[dict],
) -> dict[str, Any]:
    """David Puell balanced price proxy: (realized cap - delta cap) / supply estimate."""
    delta_by_date = {p.get("date"): p.get("value") for p in delta_cap_series}
    out: list[dict] = []
    for pt in realized_series:
        date = pt.get("date")
        realized = pt.get("value")
        delta = delta_by_date.get(date)
        if realized is None or delta is None:
            continue
        balanced = max(0.0, float(realized) - float(delta) * 0.5)
        out.append({
            "timestamp": pt.get("timestamp"),
            "date": date,
            "value": round(balanced, 2),
            "realized": float(realized),
            "delta_cap": float(delta),
        })
    return series_to_chart(
        out,
        source="Computed · realized & delta cap",
        unit="USD",
        note="Educational balanced price proxy (Puell framework)",
    )