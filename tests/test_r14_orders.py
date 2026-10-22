"""r14 checks that do not touch the live network or rewrite series JSON."""

from __future__ import annotations

import json
import os
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from api_errors import BadRequest, canonical_timespan


def test_timespan_aliases_and_http_400():
    from api_dispatch import handle_api
    from btc_indicators_api import _apply_timespan

    assert canonical_timespan("30d", kind="onchain") == "30days"
    assert canonical_timespan("1y", kind="series") == "1year"
    assert canonical_timespan("1yr", kind="series") == "1year"
    assert canonical_timespan("7days", kind="onchain") == "7days"
    assert canonical_timespan("7d", kind="onchain") == "7days"
    assert canonical_timespan("", kind="onchain") == "30days"
    assert canonical_timespan(None, kind="series") == "all"
    try:
        canonical_timespan("fortnight", kind="onchain")
        raise AssertionError("unknown timespan must raise")
    except BadRequest as exc:
        assert "30days" in exc.accepted
        assert "7days" in exc.accepted
        assert not isinstance(exc, ValueError)

    now = int(time.time())
    payload = {
        "series": [
            {"timestamp": now - 10 * 86400, "value": 1},
            {"timestamp": now - 40 * 86400, "value": 2},
        ]
    }
    month = _apply_timespan(payload, "30d")
    assert month["timespan"] == "30days"
    assert [row["value"] for row in month["series"]] == [1]
    week = _apply_timespan(payload, "7days")
    assert week["timespan"] == "7days"
    assert week["series"] == []
    assert len(_apply_timespan(payload, "")["series"]) == 2

    class _Buf:
        def __init__(self):
            self.raw = b""

        def write(self, data):
            self.raw += data

    class _Handler:
        def __init__(self, path):
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

    bad = _Handler("/api/onchain/chart?name=hash-rate&timespan=fortnight")
    handle_api(bad)
    assert bad.status == 400, bad.status
    body = json.loads(bad.wfile.raw)
    assert "7days" in body["accepted"]
    missing = _Handler("/api/does-not-exist-r14")
    handle_api(missing)
    assert missing.status == 404


def test_warm_order_and_cache_ttl():
    from macro_data.misc_metrics import CACHE_TTL as metrics_ttl
    from macro_data.misc_whales import CACHE_TTL as whale_ttl
    from server import WARM_STEP_ORDER

    assert whale_ttl >= 600
    assert metrics_ttl >= 600
    assert WARM_STEP_ORDER.index("snapshot") < WARM_STEP_ORDER.index("whales")
    assert WARM_STEP_ORDER.index("options") < WARM_STEP_ORDER.index("whales")
    assert WARM_STEP_ORDER.index("depth") < WARM_STEP_ORDER.index("whales")


def test_active_addresses_prefer_later_series_without_writing():
    import btc_data.fetchers as fetchers
    import btc_data.store as store
    from btc_indicators_api import _chart_active_address_series

    writes = []
    calls = {"n": 0}
    original_read = store.read_series_cached
    original_fetch = fetchers.fetch_blockchain_chart
    original_write = store.write_series

    def refuse_write(*_args, **_kwargs):
        writes.append(1)
        return False

    july = {
        "series": [{"timestamp": 1785369600, "date": "2026-07-30", "value": 497475.0}],
        "latest": {"timestamp": 1785369600, "date": "2026-07-30", "value": 497475.0},
        "source": "store",
        "fetchedAt": "2026-07-30T00:00:00Z",
    }
    october = {
        "series": [{"timestamp": 1792454400, "date": "2026-10-20", "value": 472935.0}],
        "latest": {"timestamp": 1792454400, "date": "2026-10-20", "value": 472935.0},
        "source": "Blockchain.info",
        "fetchedAt": "2026-10-22T00:00:00Z",
    }
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fresh = {
        "series": [{"date": today, "value": 500111.0}],
        "latest": {"date": today, "value": 500111.0},
        "source": "Blockchain.info",
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    bodies = {"current": july}

    def read_store(_metric, ttl=0):
        return bodies["current"]

    def fetch_chart(name, span, refresh=False):
        calls["n"] += 1
        assert name == "n-unique-addresses"
        assert span == "30days"
        assert refresh is True
        return october

    store.read_series_cached = read_store
    store.write_series = refuse_write
    fetchers.fetch_blockchain_chart = fetch_chart
    try:
        live = _chart_active_address_series(refresh=False)
        assert live["latest"]["value"] == 472935.0
        assert live["stale"] is False
        assert calls["n"] == 1
        bodies["current"] = fresh
        calls["n"] = 0
        stored = _chart_active_address_series(refresh=False)
        assert stored["latest"]["value"] == 500111.0
        assert calls["n"] == 0
        assert writes == []
    finally:
        store.read_series_cached = original_read
        store.write_series = original_write
        fetchers.fetch_blockchain_chart = original_fetch


def test_history_sliding_window_and_jsonl():
    import cross_market_history as hist

    now_ms = time.time() * 1000
    boundary = (int(now_ms // 300_000) + 1) * 300_000
    events = [
        {"ts": boundary + 1000, "pair": "BTCUSDT", "type": "shock", "z": 1},
        {"ts": boundary - 1000, "pair": "BTCUSDT", "type": "shock", "z": 2},
    ]
    for i in range(5):
        events.append({
            "ts": now_ms - i * 300_000,
            "pair": "EXACT",
            "type": "shock",
            "z": i,
        })
    original = hist._load_events
    hist._load_events = lambda: list(events)
    try:
        out = hist.get_history(days=2, limit=50, window="7d")
    finally:
        hist._load_events = original
    straddles = [row for row in out["events"] if row.get("pair") == "BTCUSDT"]
    exact = [row for row in out["events"] if row.get("pair") == "EXACT"]
    assert len(straddles) == 1, straddles
    assert len(exact) == 5, len(exact)

    tmp = Path(tempfile.mkdtemp()) / "xmarket_history.jsonl"
    os.environ["XMARKET_HISTORY_PATH"] = str(tmp)
    store = {}
    original_get = hist.cache_service.get
    original_set = hist.cache_service.set

    def fake_get(_key, default=None, ttl=None):
        return store.get("events", default if default is not None else [])

    def fake_set(_key, value, ttl=None):
        store["events"] = value
        return value

    hist.cache_service.get = fake_get
    hist.cache_service.set = fake_set
    try:
        appended = hist.append_events([
            {"ts": now_ms, "pair": "DISK", "type": "shock", "z": 3},
        ])
        assert appended["appended"] == 1
        assert tmp.is_file()
        loaded = hist.get_history(days=1, limit=10, window="24h")
        assert any(row.get("pair") == "DISK" for row in loaded["events"])
    finally:
        hist.cache_service.get = original_get
        hist.cache_service.set = original_set
        os.environ.pop("XMARKET_HISTORY_PATH", None)


def test_btc_100k_nearest_expiry_and_ladder_filter():
    from macro_drivers_prediction_markets import _find_monotonicity_arbs, _pick_btc_100k

    today = datetime.now(timezone.utc)
    near = (today + timedelta(days=10)).strftime("%Y-%m-%d")
    month = (today + timedelta(days=40)).strftime("%Y-%m-%d")
    later = (today + timedelta(days=80)).strftime("%Y-%m-%d")
    markets = [
        {"question": "Bitcoin above 100k in October?", "endDate": near, "yesProb": 1, "volume24h": 9_000_000},
        {"question": "Bitcoin above $100,000 by December?", "endDate": month, "yesProb": 22, "volume24h": 10},
        {"question": "Bitcoin above 100k by March?", "endDate": later, "yesProb": 30, "volume24h": 9_000_000},
    ]
    pick = _pick_btc_100k(markets)
    assert pick["endDate"] == month
    assert _pick_btc_100k([markets[0]]) is None

    def leg(strike, yes, liquidity, quoted=None):
        return {
            "id": f"leg-{strike}",
            "question": f"Will Bitcoin be above ${strike:,}?",
            "eventTitle": "BTC ladder",
            "platform": "polymarket",
            "yesOdds": yes,
            "noOdds": 1 - yes,
            "endDate": "2026-12-31",
            "active": True,
            "resolved": False,
            "liquidity": liquidity,
            "volume24h": liquidity,
            "quotedAt": quoted,
        }

    liquid = _find_monotonicity_arbs([
        leg(100000, 0.40, 50_000),
        leg(110000, 0.70, 40_000),
    ])
    assert len(liquid) == 1, liquid
    legs = liquid[0]["legsLiquidity"]
    assert len(legs) == 2
    assert legs[0]["liquidity"] == 50_000
    assert legs[1]["liquidity"] == 40_000
    old = (datetime.now(timezone.utc) - timedelta(hours=8)).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert _find_monotonicity_arbs([
        leg(100000, 0.40, 50_000, old),
        leg(110000, 0.70, 40_000, old),
    ]) == []
    assert _find_monotonicity_arbs([
        leg(100000, 0.40, 10),
        leg(110000, 0.70, 10),
    ]) == []


def test_treasury_label_uses_summed_total():
    from server import _usd_billions_label

    assert _usd_billions_label(105_007_000_000) == "$105.007B"


def test_fred_timeout_uses_bls_cpi():
    import macro_data.fred_csv as fred
    import macro_drivers_api as api

    obs = [("2025-09-01", 100.0), ("2026-09-01", 104.0)]
    original = fred.fetch_fred_csv

    def boom(series_id, refresh=False):
        raise TimeoutError(f"FRED read timed out for {series_id}")

    fred.fetch_fred_csv = boom
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
    assert abs(row["value"] - 4.0) < 1e-6
    assert row["value"] != 0
    assert body["latest"]["UNRATE"]["status"] == "NO DATA"
    assert body["source"] == "FRED+BLS"


def test_farside_flow_row():
    from server import parse_farside_flows

    tickers = ["IBIT", "FBTC", "BITB", "ARKB", "BTCO", "EZBC", "BRRR", "HODL", "BTCW", "MSBT", "GBTC", "BTC"]
    values = ["235.0", "212.7", "19.2", "9.8", "0.0", "7.3", "0.0", "0.0", "0.0", "0.0", "32.6", "8.2", "524.8"]
    head = "".join(f"<th>{ticker}</th>" for ticker in ["Date", *tickers, "Total"])
    cells = "".join(f'<span class="tabletext">{value}</span>' for value in ["21 Oct 2026", *values])
    older = "".join(
        f'<span class="tabletext">{value}</span>'
        for value in ["20 Oct 2026", *["1.0"] * 12, "12.0"]
    )
    html = (
        '<table class="etf"><thead><tr>' + head + "</tr></thead><tbody>"
        f"<tr>{older}</tr><tr>{cells}</tr></tbody></table>"
    )
    parsed = parse_farside_flows(html)
    assert parsed["status"] == "ok"
    assert parsed["source"] == "farside.co.uk/btc"
    assert parsed["tickers"][:12] == tickers
    latest = parsed["rows"][0]
    assert latest["dateIso"] == "2026-10-21"
    assert abs(latest["totalUsdM"] - 524.8) < 1e-6
    assert abs(sum(latest["flows"][ticker] for ticker in tickers) - 524.8) < 1e-6


def test_timeseries_cache_key_includes_version():
    import timeseries_models as ts

    version = ts._product_version()
    package = json.loads(Path("package.json").read_text(encoding="utf-8"))["version"]
    assert version == package
    seen = {}
    original = ts._cache_get

    def grab(key):
        seen["key"] = key
        if key.startswith(f"ts:suite:v14:{version}:"):
            return {"productVersion": version, "models": [], "marker": "hit"}
        return {"productVersion": "0.0.1", "models": [{"id": "stale"}]}

    ts._cache_get = grab
    try:
        out = ts.get_timeseries_suite_payload(days=365, models=["naive"], refresh=False)
    finally:
        ts._cache_get = original
    assert out.get("marker") == "hit"
    assert version in seen["key"]
    assert seen["key"].startswith(f"ts:suite:v14:{version}:")


def test_kline_freshness_and_mark_source():
    from market_feed import _contract_row, _kline_batch_fresh

    now = 1_700_000_000.0
    stale_rows = [[int((now - 86400) * 1000), "1", "1", "1", "1", "1"]] * 12
    fresh_rows = [[int((now - 30) * 1000), "1", "1", "1", "1", "1"]] * 12
    assert _kline_batch_fresh(stale_rows, 60, now=now) is False
    assert _kline_batch_fresh(fresh_rows, 60, now=now) is True
    marked = _contract_row(
        "BTC-USDT-260327",
        margin="USDT",
        last=100.0,
        mark=100.2,
        index=100.0,
        oi=1.0,
        volume=1.0,
        exp_ms=1_800_000_000_000,
        venue="OKX",
    )
    assert marked["priceSource"] == "mark"
    assert marked["lastTrade"] == 100.0
    assert marked["last"] == 100.0
    assert marked["mark"] == 100.2
    close = _contract_row(
        "BTC-USDT-260327",
        margin="USDT",
        last=100.0,
        mark=100.1,
        index=100.0,
        oi=1.0,
        volume=1.0,
        exp_ms=1_800_000_000_000,
        venue="OKX",
    )
    assert close["priceSource"] == "last"


if __name__ == "__main__":
    fns = [
        test_timespan_aliases_and_http_400,
        test_warm_order_and_cache_ttl,
        test_active_addresses_prefer_later_series_without_writing,
        test_history_sliding_window_and_jsonl,
        test_btc_100k_nearest_expiry_and_ladder_filter,
        test_treasury_label_uses_summed_total,
        test_fred_timeout_uses_bls_cpi,
        test_farside_flow_row,
        test_timeseries_cache_key_includes_version,
        test_kline_freshness_and_mark_source,
    ]
    failed = 0
    for fn in fns:
        try:
            fn()
            print("PASS", fn.__name__)
        except Exception as exc:
            failed += 1
            print("FAIL", fn.__name__, type(exc).__name__, exc)
    print("ALL PASS" if not failed else f"{failed} FAILED", len(fns))
    raise SystemExit(1 if failed else 0)
