"""25-delta risk reversal.

Rate is zero. For each expiry, the put whose Black-Scholes delta is nearest
-0.25 and the call nearest +0.25. Risk reversal is put IV minus call IV, in
vol points. Two expiries that straddle 30 days are interpolated. A single
listed expiry is labelled with that expiry instead of a fake 30-day blend.
"""

from __future__ import annotations

import math
from typing import Any


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _call_delta(spot: float, strike: float, t_years: float, iv: float) -> float | None:
    if spot <= 0 or strike <= 0 or t_years <= 0 or iv <= 0:
        return None
    d1 = (math.log(spot / strike) + 0.5 * iv * iv * t_years) / (iv * math.sqrt(t_years))
    return _norm_cdf(d1)


def _iv_decimal(raw: Any) -> float | None:
    try:
        iv = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(iv) or iv <= 0:
        return None
    if 3 < iv < 500:
        return iv / 100.0
    if iv <= 3:
        return iv
    return None


def risk_reversal_25d(
    options: list[dict],
    index: float | None,
    *,
    now_ms: float | None = None,
) -> dict[str, Any]:
    """Return skew25 (vol points), method, and the expiry label."""
    import time

    now = float(now_ms if now_ms is not None else time.time() * 1000.0)
    try:
        spot = float(index or 0)
    except (TypeError, ValueError):
        spot = 0.0
    empty = {
        "skew25": None,
        "method": "25d RR, puts minus calls",
        "expiry": None,
    }
    if spot <= 0:
        return empty

    by_exp: dict[int, list[dict]] = {}
    for opt in options or []:
        if not isinstance(opt, dict):
            continue
        try:
            exp = int(float(opt.get("expiry") or opt.get("expiration_timestamp") or 0))
            strike = float(opt.get("strike"))
        except (TypeError, ValueError):
            continue
        if exp <= 0 or strike <= 0:
            continue
        if exp < 1_000_000_000_000:
            exp *= 1000
        iv = _iv_decimal(opt.get("markIv") if opt.get("markIv") is not None else opt.get("mark_iv"))
        if iv is None:
            continue
        side = str(opt.get("side") or opt.get("option_type") or "C")[:1].upper()
        if side not in ("C", "P"):
            side = "C"
        by_exp.setdefault(exp, []).append({"strike": strike, "side": side, "markIv": iv})

    rows: list[dict] = []
    for exp, opts in by_exp.items():
        days = (exp - now) / 86_400_000.0
        if days < 1 or days > 400:
            continue
        t_years = max(days / 365.0, 1.0 / 365.0)
        best_put = None
        best_call = None
        put_dist = 1e9
        call_dist = 1e9
        for opt in opts:
            delta = _call_delta(spot, opt["strike"], t_years, opt["markIv"])
            if delta is None:
                continue
            if opt["side"] == "P":
                dist = abs((delta - 1.0) - (-0.25))
                if dist < put_dist:
                    put_dist = dist
                    best_put = opt
            else:
                dist = abs(delta - 0.25)
                if dist < call_dist:
                    call_dist = dist
                    best_call = opt
        if best_put is None or best_call is None:
            continue
        if put_dist > 0.10 or call_dist > 0.10:
            continue
        rows.append({
            "exp": exp,
            "days": days,
            "rr": (best_put["markIv"] - best_call["markIv"]) * 100.0,
        })
    if not rows:
        return empty
    rows.sort(key=lambda row: row["days"])
    before = next((row for row in reversed(rows) if row["days"] <= 30), None)
    after = next((row for row in rows if row["days"] >= 30), None)
    if before and after and before["exp"] != after["exp"] and after["days"] != before["days"]:
        weight = (30.0 - before["days"]) / (after["days"] - before["days"])
        rr = before["rr"] + (after["rr"] - before["rr"]) * weight
        return {
            "skew25": rr,
            "method": "25d RR, 30d interpolated, puts minus calls",
            "expiry": f"{_exp_label(before['exp'])}–{_exp_label(after['exp'])}",
        }
    nearest = min(rows, key=lambda row: abs(row["days"] - 30.0))
    return {
        "skew25": nearest["rr"],
        "method": f"25d RR, {nearest['days']:.0f}d listed, puts minus calls",
        "expiry": _exp_label(nearest["exp"]),
    }


def _exp_label(exp_ms: int) -> str:
    import time

    return time.strftime("%d %b %Y", time.gmtime(exp_ms / 1000.0))
