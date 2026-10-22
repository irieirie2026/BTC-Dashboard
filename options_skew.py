"""25-delta risk reversal.

Delta is the Black-76 forward delta, not a premium-adjusted delta. For each
expiry the forward is the median underlying_price on that expiry, and the
index is used only when that forward is missing. Put IV and call IV are
linearly interpolated in delta to exactly −0.25 and +0.25. An expiry with no
strikes on both sides of the target is skipped. Risk reversal is put IV minus
call IV, in vol points. Two expiries that straddle 30 days are interpolated.
A single listed expiry is labelled with that expiry instead of a fake 30-day
blend. The return includes the per-expiry risk reversals and the weights.
"""

from __future__ import annotations

import math
from typing import Any


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _call_delta(forward: float, strike: float, t_years: float, iv: float) -> float | None:
    """Black-76 call delta. Pass the forward, not a premium-adjusted spot delta."""
    if forward <= 0 or strike <= 0 or t_years <= 0 or iv <= 0:
        return None
    d1 = (math.log(forward / strike) + 0.5 * iv * iv * t_years) / (iv * math.sqrt(t_years))
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


def _positive(raw: Any) -> float | None:
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None
    if math.isfinite(val) and val > 0:
        return val
    return None


def _median(values: list[float]) -> float | None:
    ordered = sorted(v for v in values if v > 0)
    if not ordered:
        return None
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2.0


def _interp_iv(points: list[tuple[float, float]], target: float) -> float | None:
    """Linear IV in delta. None when the strikes do not bracket ``target``."""
    if not points:
        return None
    ordered = sorted(points, key=lambda row: row[0])
    below = [row for row in ordered if row[0] <= target]
    above = [row for row in ordered if row[0] >= target]
    if not below or not above:
        return None
    lo = below[-1]
    hi = above[0]
    if hi[0] == lo[0]:
        return lo[1]
    weight = (target - lo[0]) / (hi[0] - lo[0])
    return lo[1] + (hi[1] - lo[1]) * weight


def _forward_of(opt: dict) -> float | None:
    for key in ("underlying_price", "underlyingPrice", "estimated_delivery_price"):
        val = _positive(opt.get(key))
        if val is not None:
            return val
    return None


def _leg(row: dict, weight: float) -> dict[str, Any]:
    return {
        "expiry": _exp_label(row["exp"]),
        "days": round(float(row["days"]), 2),
        "rr": round(float(row["rr"]), 4),
        "weight": round(float(weight), 4),
    }


def _tie_out(legs: list[dict]) -> str:
    bits = []
    for leg in legs:
        sign = "+" if leg["rr"] >= 0 else ""
        bits.append(f"{leg['expiry']} RR {sign}{leg['rr']:.2f} × {leg['weight']:.2f}")
    bits.append("forward delta, not premium-adjusted")
    return " · ".join(bits)


def _pack(rr: float, method: str, expiry: str, legs: list[dict]) -> dict[str, Any]:
    return {
        "skew25": rr,
        "method": method,
        "expiry": expiry,
        "legs": legs,
        "tieOut": _tie_out(legs),
        "deltaConvention": "forward",
        "premiumAdjusted": False,
    }


def risk_reversal_25d(
    options: list[dict],
    index: float | None,
    *,
    now_ms: float | None = None,
) -> dict[str, Any]:
    """Return skew25 (vol points), the 30d legs, and a tie-out string."""
    import time

    now = float(now_ms if now_ms is not None else time.time() * 1000.0)
    try:
        spot = float(index or 0)
    except (TypeError, ValueError):
        spot = 0.0
    empty = {
        "skew25": None,
        "method": "25d RR, forward delta, puts minus calls",
        "expiry": None,
        "legs": [],
        "tieOut": None,
        "deltaConvention": "forward",
        "premiumAdjusted": False,
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
        by_exp.setdefault(exp, []).append({
            "strike": strike,
            "side": side,
            "markIv": iv,
            "forward": _forward_of(opt),
        })

    rows: list[dict] = []
    for exp, opts in by_exp.items():
        days = (exp - now) / 86_400_000.0
        if days < 1 or days > 400:
            continue
        t_years = max(days / 365.0, 1.0 / 365.0)
        forward = _median([opt["forward"] for opt in opts if opt.get("forward")]) or spot
        puts: list[tuple[float, float]] = []
        calls: list[tuple[float, float]] = []
        for opt in opts:
            delta = _call_delta(forward, opt["strike"], t_years, opt["markIv"])
            if delta is None:
                continue
            if opt["side"] == "P":
                puts.append((delta - 1.0, opt["markIv"]))
            else:
                calls.append((delta, opt["markIv"]))
        put_iv = _interp_iv(puts, -0.25)
        call_iv = _interp_iv(calls, 0.25)
        if put_iv is None or call_iv is None:
            continue
        rows.append({
            "exp": exp,
            "days": days,
            "rr": (put_iv - call_iv) * 100.0,
        })
    if not rows:
        return empty
    rows.sort(key=lambda row: row["days"])
    before = next((row for row in reversed(rows) if row["days"] <= 30), None)
    after = next((row for row in rows if row["days"] >= 30), None)
    if before and after and before["exp"] != after["exp"] and after["days"] != before["days"]:
        weight = (30.0 - before["days"]) / (after["days"] - before["days"])
        rr = before["rr"] + (after["rr"] - before["rr"]) * weight
        legs = [_leg(before, 1.0 - weight), _leg(after, weight)]
        return _pack(
            rr,
            "25d RR, 30d interpolated, forward delta, puts minus calls",
            f"{_exp_label(before['exp'])}–{_exp_label(after['exp'])}",
            legs,
        )
    nearest = min(rows, key=lambda row: abs(row["days"] - 30.0))
    return _pack(
        nearest["rr"],
        f"25d RR, {nearest['days']:.0f}d listed, forward delta, puts minus calls",
        _exp_label(nearest["exp"]),
        [_leg(nearest, 1.0)],
    )


def _exp_label(exp_ms: int) -> str:
    import time

    return time.strftime("%d %b %Y", time.gmtime(exp_ms / 1000.0))
