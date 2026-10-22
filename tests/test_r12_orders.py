"""r12 checks that do not touch the live cache or a network.

GARCH(2,1) must reach arch_model on synthetic data. Real BTC often pins the
extra alpha at zero; that case is a warning, not a reason to fake a likelihood.
"""

from __future__ import annotations

import math
import time
from datetime import datetime, timezone

import numpy as np

from market_feed import _dedupe_contracts, spot_median_from_rows
from server import _fetch_binance_perp, _fetch_bybit_spot, _geo_blocked, _geo_placeholder
from timeseries_models import _statsmodels_arima_path
from volatility_models import MODEL_CATALOG, _fit_arch


def _catalog(model_id: str) -> dict:
    cat = next(m for m in MODEL_CATALOG if m["id"] == model_id)
    return cat


def _garch21_returns(n: int = 900, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    eps = rng.standard_normal(n)
    r = np.zeros(n)
    sig2 = np.empty(n)
    sig2[0] = sig2[1] = 1e-4
    r[0] = math.sqrt(sig2[0]) * eps[0]
    r[1] = math.sqrt(sig2[1]) * eps[1]
    omega, a1, a2, b1 = 1e-6, 0.05, 0.25, 0.60
    for t in range(2, n):
        sig2[t] = omega + a1 * r[t - 1] ** 2 + a2 * r[t - 2] ** 2 + b1 * sig2[t - 1]
        r[t] = math.sqrt(max(sig2[t], 1e-12)) * eps[t]
    return r


def test_garch_p_changes_likelihood():
    rets = _garch21_returns()
    data = {"returns": rets}
    fit11 = _fit_arch("garch11", _catalog("garch11"), data, "normal")
    fit21 = _fit_arch("garch21", _catalog("garch21"), data, "normal")
    assert fit11.get("ok") is True, fit11.get("error")
    assert fit21.get("ok") is True, fit21.get("error")
    assert fit21.get("orders", {}).get("p") == 2
    assert fit21.get("orders", {}).get("q") == 1
    names = [str(p.get("name")) for p in fit21.get("params") or []]
    assert any(name == "alpha[2]" for name in names), names
    ll11 = float(fit11["logLikelihood"])
    ll21 = float(fit21["logLikelihood"])
    assert abs(ll21 - ll11) > 1e-3, (ll11, ll21, fit21.get("warning"))


def test_arma_d0_forecast_stays_in_return_units():
    rng = np.random.default_rng(3)
    rets = rng.normal(0.0, 0.02, 400)
    path, meta = _statsmodels_arima_path(rets, (1, 0, 1), 5)
    assert meta["seriesUnits"] == "returns"
    assert abs(path[0] - meta["forecastLogp"][0]) < 1e-9
    # An integrated model still converts a log-price path into a return.
    path_d, meta_d = _statsmodels_arima_path(np.cumsum(rets), (1, 1, 0), 3)
    assert meta_d["seriesUnits"] == "log-price"
    last = float(np.cumsum(rets)[-1])
    assert abs(path_d[0] - (meta_d["forecastLogp"][0] - last)) < 1e-9


def test_history_dedupes_and_honours_window():
    import cross_market_history as hist

    now_ms = time.time() * 1000
    events = []
    for i in range(40):
        events.append({
            "ts": now_ms - i * 1000,
            "venue": "Uniswap",
            "type": "alert",
            "z": 2.04,
        })
    events.append({
        "ts": now_ms - 400_000,
        "venue": "Curve",
        "type": "alert",
        "z": 3.2,
    })
    old_ms = (time.time() - 3 * 86400) * 1000
    events.append({
        "ts": old_ms,
        "venue": "OldVenue",
        "type": "alert",
        "z": 1.5,
    })
    # Distinct shocks inside the last day, more than the old days=30 event cap.
    for i in range(35):
        events.append({
            "ts": now_ms - (i + 1) * 300_000,
            "venue": f"V{i}",
            "type": "alert",
            "z": 1.0 + i,
        })

    hist._load_events = lambda: list(events)
    wide = hist.get_history(days=30, limit=2000, window="30d")
    assert wide["count"] > 30, wide["count"]
    assert wide["days"] == 30
    venues = {e.get("venue") for e in wide["events"]}
    assert "OldVenue" in venues
    # Forty copies inside one 5-minute bucket collapse to one row.
    uni = [e for e in wide["events"] if e.get("venue") == "Uniswap"]
    assert len(uni) == 1, len(uni)

    day = hist.get_history(days=30, limit=2000, window="24h")
    assert day["window"] == "24h"
    assert all(e.get("venue") != "OldVenue" for e in day["events"])
    assert day["count"] > 30

    week = hist.get_history(days=30, limit=5, window="7d")
    assert week["days"] == 7
    assert week["count"] == 5


def test_spot_median_skips_unavailable():
    comp = spot_median_from_rows([
        {"exchange": "A", "price": 100},
        {"exchange": "Bybit", "price": None, "unavailable": True, "status": "UNAVAILABLE (geo-blocked)"},
        {"exchange": "C", "price": 120},
        {"exchange": "D", "price": None},
    ])
    assert comp["venueCount"] == 2
    assert comp["venues"] == ["A", "C"]
    assert comp["median"] == 110
    assert comp["label"].startswith("Median · 2 venues")


def test_futures_dedupe_is_per_margin_and_day():
    day = datetime(2026, 10, 30, tzinfo=timezone.utc)
    ms = int(day.timestamp() * 1000)
    later = ms + 3 * 3600 * 1000
    rows = [
        {"margin": "USDT", "deliveryDate": ms, "symbol": "A", "openInterest": 1, "venue": "OKX"},
        {"margin": "USDT", "deliveryDate": later, "symbol": "B", "openInterest": 9, "venue": "OKX"},
        {"margin": "COIN", "deliveryDate": ms, "symbol": "C", "openInterest": 4, "venue": "Deribit"},
    ]
    out = _dedupe_contracts(rows)
    assert len(out) == 2
    usdt = [r for r in out if r["margin"] == "USDT"]
    coin = [r for r in out if r["margin"] == "COIN"]
    assert len(usdt) == 1 and usdt[0]["openInterest"] == 9
    assert len(coin) == 1 and coin[0]["venue"] == "Deribit"


def test_geo_block_is_403_or_451_only():
    class Boom(Exception):
        def __init__(self, code, message):
            super().__init__(message)
            self.code = code

    assert _geo_blocked(Boom(451, "HTTP Error 451"))
    assert _geo_blocked(Boom(403, "HTTP Error 403"))
    assert not _geo_blocked(Boom(None, "SSL: CERTIFICATE_VERIFY_FAILED"))
    bybit = _geo_placeholder(_fetch_bybit_spot)
    binance = _geo_placeholder(_fetch_binance_perp)
    assert bybit["exchange"] == "Bybit" and bybit["price"] is None and bybit["unavailable"] is True
    assert "geo-blocked" in bybit["status"]
    assert binance["exchange"] == "Binance" and binance["type"] == "perp" and binance["price"] is None


def test_btc100k_names_one_market():
    from macro_drivers_prediction_markets import _btc100k_caption, _btc100k_legs, _pick_btc_100k

    markets = [
        {
            "id": "poly-701496",
            "platform": "polymarket",
            "question": "Will Bitcoin hit $100,000 by 2027?",
            "yesProb": 26,
            "volume24h": 10,
            "endDate": "2026-12-31",
        },
        {
            "id": "kalshi-100k",
            "platform": "kalshi",
            "question": "Bitcoin above $100,000",
            "yesProb": 48,
            "volume24h": 90,
            "endDate": "2027-01-01",
        },
    ]
    pick = _pick_btc_100k(markets)
    assert pick["id"] == "kalshi-100k"
    assert pick["yesProb"] == 48
    caption = _btc100k_caption(pick)
    assert "Kalshi" in caption
    assert "48" not in caption or "100" in caption
    legs = _btc100k_legs(markets)
    assert {row["id"] for row in legs} == {"poly-701496", "kalshi-100k"}
    probs = [row["yesProb"] for row in legs]
    assert 37 not in probs


def test_cpi_yoy_is_same_month_last_year():
    from macro_drivers_api import _fred_display_points

    index = 323.364
    obs = [
        ("2025-09-01", index),
        ("2026-08-01", 334.0),
        ("2026-09-01", index * 1.037),
    ]
    points = _fred_display_points(obs, "yoy")
    sept = next(row for row in points if row["date"].startswith("2026-09"))
    assert abs(sept["value"] - 3.7) < 0.001
    assert all(not row["date"].startswith("2026-08") for row in points)


def test_us_fred_timeout_is_no_data_not_zero():
    import macro_data.fred_csv as fred
    import macro_drivers_api as api

    original = fred.fetch_fred_csv

    def timed_out(series_id, refresh=False):
        fred._LAST_ERROR[series_id] = (
            f"FRED fetch failed for {series_id}: TimeoutError: The read operation timed out"
        )
        return []

    fred.fetch_fred_csv = timed_out

    def bls_down():
        raise TimeoutError("BLS read timed out")

    api._BLS_FETCH = bls_down
    try:
        payload = api.get_us_fred_payload(refresh=True)
    finally:
        fred.fetch_fred_csv = original
        api._BLS_FETCH = None
    row = payload["latest"]["CPIAUCNS"]
    assert row["id"] == "CPIAUCNS"
    assert row["status"] == "NO DATA"
    assert row["value"] is None
    assert row["value"] != 0
    assert "TimeoutError" in (row["reason"] or "")
    assert payload["series"]["CPIAUCNS"]["points"] == []


if __name__ == "__main__":
    fns = [
        test_garch_p_changes_likelihood,
        test_arma_d0_forecast_stays_in_return_units,
        test_history_dedupes_and_honours_window,
        test_spot_median_skips_unavailable,
        test_futures_dedupe_is_per_margin_and_day,
        test_geo_block_is_403_or_451_only,
        test_btc100k_names_one_market,
        test_cpi_yoy_is_same_month_last_year,
        test_us_fred_timeout_is_no_data_not_zero,
    ]
    for fn in fns:
        fn()
        print("PASS", fn.__name__)
    print("ALL PASS", len(fns))
