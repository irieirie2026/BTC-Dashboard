"""r13 checks that do not touch the live cache or a network."""

from __future__ import annotations

import threading
import time

from btc_indicators_api import _active_address_cell
from macro_drivers_api import _bls_points_from_payload, _fred_display_points
from market_feed import _ticker_from_exchange_row
from server import _build_exchanges_perp, _ex_pct_change
from timeseries_models import hit_rate_interval


def test_highest_funding_is_signed_max():
    rows = [
        {"exchange": "KuCoin", "pair": "BTC", "price": 100, "fundingRate": -0.000056},
        {"exchange": "OKX", "pair": "BTC", "price": 100, "fundingRate": 0.000030},
        {"exchange": "Bybit", "pair": "BTC", "price": 100, "fundingRate": 0.000010},
    ]
    heroes, _table, _lines = _build_exchanges_perp(rows, [])
    by_name = {hero["name"]: hero for hero in heroes}
    assert by_name["Highest Funding"]["value"] == "OKX"
    assert by_name["Highest Funding"]["sub"] == "0.0030%"
    assert by_name["Lowest Funding"]["value"] == "KuCoin"
    assert by_name["Lowest Funding"]["sub"] == "-0.0056%"


def test_hit_rate_ci_naive_gate():
    weak = hit_rate_interval(0.595, 37)
    assert weak["lo"] <= 0.50
    assert weak["beatsNaive"] is False
    assert weak["hi"] > 0.50
    strong = hit_rate_interval(0.80, 200)
    assert strong["lo"] > 0.50
    assert strong["beatsNaive"] is True


def test_history_dedupes_pair_and_type():
    import cross_market_history as hist

    now_ms = time.time() * 1000
    events = [
        {"ts": now_ms, "pair": "BTCUSDT", "venue": "OKX", "type": "shock", "z": 2.2},
        {"ts": now_ms - 800, "pair": "BTCUSDT", "venue": "OKX", "type": "shock", "z": 4.8},
        {"ts": now_ms - 400, "pair": "BTCUSDT", "venue": "OKX", "type": "other", "z": 4.8},
    ]
    original = hist._load_events
    hist._load_events = lambda: list(events)
    try:
        out = hist.get_history(days=1, limit=40, window="24h")
    finally:
        hist._load_events = original
    shocks = [row for row in out["events"] if row.get("type") == "shock"]
    others = [row for row in out["events"] if row.get("type") == "other"]
    assert len(shocks) == 1, shocks
    assert len(others) == 1, others
    assert out["count"] == 2


def test_whales_cache_served_while_warm_in_flight():
    import macro_data.misc_whales as whales
    from cache.service import get_cache_service
    from macro_data.cache import cache_set

    key = "misc:whales:v3"
    service = get_cache_service()
    service.delete(key)
    sentinel = {"heroes": [], "updatedAt": "r13", "marker": "r13-cache"}
    calls = {"n": 0}
    original = whales._btc_usd

    def boom():
        calls["n"] += 1
        raise RuntimeError("duplicate mempool scan")

    def publish():
        time.sleep(0.25)
        cache_set(key, sentinel)
        whales.note_whale_warm_done()

    whales._btc_usd = boom
    whales.note_whale_warm_start()
    threading.Thread(target=publish, daemon=True).start()
    try:
        out = whales.get_misc_whales_payload(refresh=False, from_warm=False)
    finally:
        whales._btc_usd = original
        whales.note_whale_warm_done()
        service.delete(key)
    assert out.get("fromCache") is True
    assert out.get("marker") == "r13-cache"
    assert calls["n"] == 0


def test_bls_cpi_yoy_and_fallback():
    import macro_data.fred_csv as fred
    import macro_drivers_api as api

    payload = {
        "status": "REQUEST_SUCCEEDED",
        "Results": {
            "series": [
                {
                    "seriesID": "CUUR0000SA0",
                    "data": [
                        {"year": "2025", "period": "M09", "value": "100.0"},
                        {"year": "2026", "period": "M09", "value": "103.7"},
                        {"year": "2026", "period": "M13", "value": "999"},
                    ],
                }
            ]
        },
    }
    obs = _bls_points_from_payload(payload)
    assert ("2026-09-01", 103.7) in obs
    assert all(date[5:7] != "13" for date, _value in obs)
    points = _fred_display_points(obs, "yoy")
    sept = next(row for row in points if row["date"].startswith("2026-09"))
    assert abs(sept["value"] - 3.7) < 1e-6

    original = fred.fetch_fred_csv

    def empty(series_id, refresh=False):
        fred._LAST_ERROR[series_id] = (
            f"FRED fetch failed for {series_id}: TimeoutError: The read operation timed out"
        )
        return []

    fred.fetch_fred_csv = empty
    api._BLS_FETCH = lambda: list(obs)
    try:
        body = api.get_us_fred_payload(refresh=True)
    finally:
        fred.fetch_fred_csv = original
        api._BLS_FETCH = None
    row = body["latest"]["CPIAUCNS"]
    assert row["status"] == "ok"
    assert row["source"] == "BLS"
    assert row["seriesId"] == "CUUR0000SA0"
    assert abs(row["value"] - 3.7) < 1e-6
    assert row["value"] != 0
    assert body["latest"]["UNRATE"]["status"] == "NO DATA"
    assert body["latest"]["UNRATE"]["value"] is None
    assert body["source"] == "FRED+BLS"


def test_live_prediction_excludes_mocks():
    import macro_drivers_prediction_markets as pm

    originals = {
        "block": pm._detect_adm_gambling_block,
        "poly": pm._fetch_polymarket_live,
        "kalshi": pm._fetch_kalshi_live,
        "arb": pm._find_arbitrage_opportunities,
        "deribit": pm._deribit_scan_status,
    }
    live = [
        {
            "id": "poly-real-100k",
            "platform": "polymarket",
            "question": "Will Bitcoin hit $100,000 by 2027?",
            "yesProb": 25,
            "volume24h": 10,
            "section": "btc-price",
            "active": True,
            "category": "price-targets",
            "endDate": "2026-12-31",
        }
    ]
    pm._cache.clear()
    pm._find_arbitrage_opportunities = lambda markets: []
    pm._deribit_scan_status = lambda markets: {"status": "skipped"}
    pm._detect_adm_gambling_block = lambda force=False: None
    pm._fetch_polymarket_live = lambda: list(live)
    pm._fetch_kalshi_live = lambda: []
    try:
        out = pm.get_prediction_markets_payload(refresh=True, mock_only=False)
        ids = [row.get("id") for row in out["markets"]]
        assert "poly-real-100k" in ids
        assert all(not str(row_id).startswith("mock-") for row_id in ids)
        assert out["source"] == "live"

        pm._cache.clear()
        pm._detect_adm_gambling_block = lambda force=False: {
            "blocked": True,
            "affected": ["polymarket"],
            "message": "blocked",
            "blockHost": "h",
            "blockPage": "p",
            "suggestion": "s",
            "rant": "",
        }
        blocked = pm.get_prediction_markets_payload(refresh=True, mock_only=False)
        assert blocked["source"] == "adm-block"
        assert blocked["markets"] == []
        hero = next(item for item in blocked["heroes"] if item["name"] == "BTC > $100k")
        assert hero["value"] == "—"
        assert all(item["value"] == "—" for item in blocked["heroes"])
        assert all("0" != item["value"] and not str(item["value"]).startswith("$0") for item in blocked["heroes"])

        pm._cache.clear()
        mocked = pm.get_prediction_markets_payload(refresh=True, mock_only=True)
        assert mocked["source"] == "mock"
        assert any(str(row.get("id") or "").startswith("mock-") for row in mocked["markets"])
    finally:
        pm._detect_adm_gambling_block = originals["block"]
        pm._fetch_polymarket_live = originals["poly"]
        pm._fetch_kalshi_live = originals["kalshi"]
        pm._find_arbitrage_opportunities = originals["arb"]
        pm._deribit_scan_status = originals["deribit"]
        pm._cache.clear()


def test_missing_perp_open_is_not_zero_change():
    assert _ex_pct_change(84175, None) is None
    assert _ex_pct_change(84175, 0) is None
    flat = _ticker_from_exchange_row(
        {"exchange": "OKX", "price": 84175, "changePct": None, "bid": 84170, "ask": 84180}
    )
    assert flat["openPrice"] is None
    assert flat["changePct"] is None
    assert flat["priceChangePercent"] is None
    assert flat["openIs24h"] is False
    moved = _ticker_from_exchange_row({"exchange": "OKX", "price": 100, "changePct": 1.0})
    assert abs(moved["openPrice"] - (100 / 1.01)) < 1e-6
    assert moved["openIs24h"] is True


def test_snapshot_active_addresses_follow_series():
    cell = _active_address_cell(
        {"active_addresses_24h": 999999, "fetchedAt": "bitinfo"},
        {
            "latest": {"value": 504550, "date": "2026-10-16"},
            "source": "Blockchain.info",
            "fetchedAt": "store",
        },
    )
    assert cell["value"] == 504550
    assert cell["source"] == "Blockchain.info"
    assert cell["dataAsOf"] == "2026-10-16"


def test_workers_start_once():
    import server

    calls = {"n": 0}
    original = threading.Thread

    class FakeThread:
        def __init__(self, *args, **kwargs):
            calls["n"] += 1

        def start(self):
            return None

    threading.Thread = FakeThread
    server._workers_started = False
    server._workers_lock = None
    try:
        server.start_background_workers()
        server.start_background_workers()
    finally:
        threading.Thread = original
        server._workers_started = False
        server._workers_lock = None
    assert calls["n"] == 1


if __name__ == "__main__":
    fns = [
        test_highest_funding_is_signed_max,
        test_hit_rate_ci_naive_gate,
        test_history_dedupes_pair_and_type,
        test_whales_cache_served_while_warm_in_flight,
        test_bls_cpi_yoy_and_fallback,
        test_live_prediction_excludes_mocks,
        test_missing_perp_open_is_not_zero_change,
        test_snapshot_active_addresses_follow_series,
        test_workers_start_once,
    ]
    for fn in fns:
        fn()
        print("PASS", fn.__name__)
    print("ALL PASS", len(fns))
