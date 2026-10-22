"""r15 checks that do not touch the live network or rewrite series JSON."""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path


def _handler(path):
    class _Buf:
        def __init__(self):
            self.raw = b""

        def write(self, data):
            self.raw += data

    class _Handler:
        def __init__(self):
            self.path = path
            self.command = "GET"
            self.headers = {}
            self.wfile = _Buf()
            self.status = None

        def send_response(self, code):
            self.status = code

        def send_header(self, *_args):
            return None

        def end_headers(self):
            return None

    return _Handler()


def test_farside_dash_cells_follow_header_names():
    from server import parse_farside_flows

    tickers = ["BTCO", "IBIT", "FBTC", "BITB", "ARKB", "EZBC", "BRRR", "HODL", "BTCW", "MSBT", "GBTC", "BTC"]
    values = ["0.0", "235.0", "-", "19.2", "9.8", "7.3", "0.0", "0.0", "0.0", "0.0", "32.6", "8.2", "312.1"]
    head = "".join(f"<th>{ticker}</th>" for ticker in ["Date", *tickers, "Total"])
    cells = "".join(f'<span class="tabletext">{value}</span>' for value in ["21 Oct 2026", *values])
    html = f'<table class="etf"><thead><tr>{head}</tr></thead><tbody><tr>{cells}</tr></tbody></table>'
    parsed = parse_farside_flows(html)
    assert parsed["status"] == "ok"
    assert parsed["tickers"] == tickers
    latest = parsed["rows"][0]
    assert latest["flows"]["IBIT"] == 235.0
    assert latest["flows"]["BTCO"] == 0.0
    assert latest["flows"]["FBTC"] is None
    assert latest["flows"]["BITB"] == 19.2
    assert abs(sum(latest["flows"][ticker] or 0 for ticker in tickers) - 312.1) < 1e-6
    assert abs(latest["totalUsdM"] - 312.1) < 1e-6

    # Live Farside puts logos in the first header row and &nbsp; inside ticker cells.
    logo = (
        "<th><img alt=\"Ark\"></th><th><img alt=\"VanEck\"></th>"
        "<th><img alt=\"Blackrock\"></th><th><span>Total</span></th>"
    )
    names = ["IBIT", "FBTC", "BITB", "ARKB", "BTCO", "EZBC", "BRRR", "HODL", "BTCW", "MSBT", "GBTC", "BTC"]
    ticker_row = "".join(
        f'<th><span class="tabletext">&nbsp;&nbsp;{name}</span></th>' for name in names
    )
    values = ["235.0", "212.7", "19.2", "9.8", "0.0", "7.3", "0.0", "0.0", "0.0", "0.0", "32.6", "8.2", "524.8"]
    body = "".join(f'<span class="tabletext">{value}</span>' for value in ["21 Oct 2026", *values])
    live_html = (
        "<table><thead>"
        f"<tr>{logo}</tr><tr><th></th>{ticker_row}<th><span>Total</span></th></tr>"
        f"</thead><tbody><tr>{body}</tr></tbody></table>"
    )
    live = parse_farside_flows(live_html)
    assert live["tickers"] == names
    assert live["rows"][0]["flows"]["IBIT"] == 235.0
    assert live["rows"][0]["flows"]["BTCO"] == 0.0
    assert abs(live["rows"][0]["totalUsdM"] - 524.8) < 1e-6


def test_history_sorts_before_dedupe_and_reloads_from_disk(tmp_path, monkeypatch):
    import cross_market_history as hist

    live = Path("data/xmarket_history.jsonl")
    live_existed = live.exists()
    path = tmp_path / "xmarket_history.jsonl"
    monkeypatch.setenv("XMARKET_HISTORY_PATH", str(path))
    store = {}
    original_get = hist.cache_service.get
    original_set = hist.cache_service.set

    def fake_get(_key, default=None, ttl=None):
        return store.get("events", default if default is not None else [])

    def fake_set(_key, value, ttl=None):
        store["events"] = list(value)
        return value

    hist.cache_service.get = fake_get
    hist.cache_service.set = fake_set
    try:
        now_ms = time.time() * 1000
        hist.append_events([
            {"ts": now_ms - 300_000, "pair": "X", "type": "shock", "z": 3},
            {"ts": now_ms, "pair": "X", "type": "shock", "z": 1},
            {"ts": now_ms - 2_000, "pair": "X", "type": "shock", "z": 2},
        ])
        assert path.is_file()
        store.clear()
        loaded = hist.get_history(days=1, limit=20)
        xs = [row for row in loaded["events"] if row.get("pair") == "X"]
        assert len(xs) == 2, xs
        assert {row["z"] for row in xs} == {1, 3}
        again = hist.get_history(days=1, limit=20)
        assert len([row for row in again["events"] if row.get("pair") == "X"]) == 2
        assert live.exists() is live_existed
    finally:
        hist.cache_service.get = original_get
        hist.cache_service.set = original_set


def test_history_path_refuses_the_live_file_during_pytest(monkeypatch):
    import cross_market_history as hist

    monkeypatch.delenv("XMARKET_HISTORY_PATH", raising=False)
    try:
        hist._history_path()
    except RuntimeError as exc:
        assert "xmarket_history.jsonl" in str(exc)
    else:
        raise AssertionError("tests must not resolve the live history file")


def test_snapshot_cache_hit_does_not_recompute():
    import btc_indicators_api as api

    cells = {key: {"value": 1} for key in api._SNAPSHOT_LIVE_KEYS}
    cached = {"cells": cells, "fetchedAt": "2026-10-22T00:00:00Z", "sourceChain": "test"}
    original_get = api.cache_get
    original_final = api._finalize_snapshot_payload

    def refuse(*_args, **_kwargs):
        raise AssertionError("cache hit must not finalize")

    api.cache_get = lambda key, ttl=None: cached if key == "btc:bundle:snapshot:v13" else None
    api._finalize_snapshot_payload = refuse
    try:
        out = api.get_snapshot_payload(refresh=False)
    finally:
        api.cache_get = original_get
        api._finalize_snapshot_payload = original_final
    assert out["fromCache"] is True
    assert out["cells"]["open_interest"]["value"] == 1


def test_unknown_series_indicator_is_400_with_accepted_list():
    from api_dispatch import handle_api

    bad = _handler("/api/misc/btc/series?indicator=not_a_real_indicator_r15")
    handle_api(bad)
    assert bad.status == 400, bad.status
    body = json.loads(bad.wfile.raw)
    assert "active_addresses" in body["accepted"]
    assert "exchange_netflow" in body["accepted"]
    missing = _handler("/api/does-not-exist-r15")
    handle_api(missing)
    assert missing.status == 404


def test_empty_sopr_series_is_stale():
    from btc_indicators_api import _finalize_series_payload

    out = _finalize_series_payload("sopr", {"series": [], "latest": None})
    assert out["series"] == []
    assert out["latest"] is None
    assert out["stale"] is True
    assert out["unavailable"] is True
    assert out["status"] == "unavailable"
    assert out["error"] == "NO DATA"


def test_har_lookup_uses_the_desk_suite_and_does_not_substitute_close_to_close():
    import volatility_models as vm
    from cache import service as cache_service
    from server import _options_term_rv_30d

    saved = dict(vm._CACHE)
    original_get = cache_service.get
    vm._CACHE.clear()
    cache_service.get = lambda *_args, **_kwargs: None
    try:
        assert vm.lookup_active_har_term() is None
        gap = _options_term_rv_30d()
        assert gap["termRv30d"] is None
        assert gap["modelTermRv30d"] is None
        if gap["closeToCloseRv30d"] is not None:
            assert gap["termRv30d"] != gap["closeToCloseRv30d"]

        desk = vm.suite_cache_key(vm.DESK_VOL_DAYS, vm.DESK_VOL_DIST, vm.DESK_VOL_MODELS)
        wrong = "vol:suite:v8:1095:t:garch11,egarch11,gjr11,aparch11,figarch11,ewma,har_rv"
        now = time.time()
        vm._CACHE[wrong] = (
            now,
            {
                "asOf": "2026-10-21T14:22:00+00:00",
                "models": [{"id": "har_rv", "forecastTermAnn": [0.2] * 29 + [0.91]}],
            },
        )
        vm._CACHE[desk] = (
            now + 1,
            {
                "asOf": "2026-10-21T14:22:00+00:00",
                "models": [{"id": "har_rv", "forecastTermAnn": [0.2] * 29 + [0.41]}],
            },
        )
        found = vm.lookup_active_har_term()
        assert found["cacheKey"] == desk
        assert "1825" in found["cacheKey"]
        assert abs(found["term"] - 0.41) < 1e-9
        assert found["stale"] is True
    finally:
        vm._CACHE.clear()
        vm._CACHE.update(saved)
        cache_service.get = original_get


def test_model_gap_requires_liquidity_and_a_fresh_quote():
    from macro_drivers_prediction_markets import _model_gap_tradable

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    old = (datetime.now(timezone.utc) - timedelta(minutes=31)).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert _model_gap_tradable({"liquidity": 10_000, "quotedAt": now}) is True
    assert _model_gap_tradable({"liquidity": 9_999, "quotedAt": now}) is False
    assert _model_gap_tradable({"volume24h": 1_000_000, "quotedAt": now}) is False
    assert _model_gap_tradable({"liquidity": 50_000, "quotedAt": old}) is False
    assert _model_gap_tradable({"liquidity": 50_000}) is False


def test_netflow_today_is_preliminary():
    from btc_data.coinmetrics import _flag_netflow_preliminary

    today = time.strftime("%Y-%m-%d", time.gmtime())
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    fresh = _flag_netflow_preliminary({
        "latest": {"date": today, "value": 12},
        "series": [
            {"date": yesterday, "value": 4},
            {"date": today, "value": 12},
        ],
    })
    assert fresh["latest"]["preliminary"] is True
    assert fresh["latest"]["note"] == "preliminary"
    assert fresh["series"][-1]["preliminary"] is True
    assert fresh["series"][0].get("preliminary") is not True
    assert fresh["latestPreliminary"] is True
    closed = _flag_netflow_preliminary({
        "latest": {"date": yesterday, "value": 4},
        "series": [{"date": yesterday, "value": 4}],
    })
    assert closed["latestPreliminary"] is False
    assert closed["latest"].get("preliminary") is not True


def test_active_address_series_keeps_the_later_chart_point():
    import btc_data.store as store
    import btc_indicators_api as api

    writes = []
    original_write = store.write_series
    original_read = store.read_series_cached
    original_chart = api._chart_active_address_series
    store_body = {
        "series": [{"date": "2026-10-20", "timestamp": 1792454400, "value": 472935.0}],
        "latest": {"date": "2026-10-20", "timestamp": 1792454400, "value": 472935.0},
        "source": "store",
    }
    chart_body = {
        "series": [{"date": "2026-10-21", "timestamp": 1792540800, "value": 463608.0}],
        "latest": {"date": "2026-10-21", "timestamp": 1792540800, "value": 463608.0},
        "source": "Blockchain.info",
    }

    def refuse_write(*_args, **_kwargs):
        writes.append(1)
        return False

    store.write_series = refuse_write
    store.read_series_cached = lambda *_args, **_kwargs: store_body
    api._chart_active_address_series = lambda refresh=False: chart_body
    try:
        merged = api._merge_address_series(store_body, chart_body)
        assert merged["latest"]["value"] == 463608.0
        assert {row["value"] for row in merged["series"]} == {472935.0, 463608.0}
        same_day = api._merge_address_series(
            store_body,
            {"series": [{"date": "2026-10-20", "timestamp": 1792454400, "value": 463608.0}]},
        )
        assert len(same_day["series"]) == 1
        assert same_day["latest"]["value"] == 463608.0
        body = api._active_address_series_body(refresh=False)
        assert body["latest"]["value"] == 463608.0
        assert writes == []
    finally:
        store.write_series = original_write
        store.read_series_cached = original_read
        api._chart_active_address_series = original_chart


def test_warm_order_starts_with_snapshot_and_whales():
    from server import WARM_STEP_ORDER

    assert WARM_STEP_ORDER[0] == "snapshot"
    assert WARM_STEP_ORDER[1] == "whales"
    assert WARM_STEP_ORDER.index("quote") < WARM_STEP_ORDER.index("options")
