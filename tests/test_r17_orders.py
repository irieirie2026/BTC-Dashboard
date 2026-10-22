"""r17 desk repairs: perp quote age, Blockchair stale, skew tie-out, whale net."""

from __future__ import annotations

import time
import urllib.error
from datetime import datetime, timedelta, timezone


def test_cold_start_shell_and_whale_warm_are_tagged():
    import btc_indicators_api as api
    import macro_data.misc_whales as whales

    shell = api._empty_snapshot_shell()
    assert shell["stale"] is True
    assert shell["unavailable"] is True
    assert shell["reason"] == "cold start, warming"
    assert shell["status"] == "STALE"
    assert shell["error"] == "NO DATA"
    warm = whales._whale_warming_payload("misc:whales:v3")
    assert warm["stale"] is True
    assert warm["unavailable"] is True
    assert warm["reason"] == "cold start, warming"
    assert warm["status"] == "NO DATA"
    assert warm["error"] == "NO DATA"

    saved = (api.cache_get, api.cache_get_stale, api._kick_snapshot_build)
    api.cache_get = lambda *_a, **_k: None
    api.cache_get_stale = lambda _key: None
    api._kick_snapshot_build = lambda: None
    try:
        started = time.time()
        out = api.get_snapshot_payload(refresh=False)
    finally:
        api.cache_get, api.cache_get_stale, api._kick_snapshot_build = saved
    assert time.time() - started < 1
    assert out["reason"] == "cold start, warming"
    assert out["unavailable"] is True
    assert out["status"] == "STALE"


def test_stale_snapshot_copy_stays_a_copy():
    import btc_indicators_api as api

    saved = (api.cache_get, api.cache_get_stale, api._kick_snapshot_build, api._finalize_snapshot_payload)
    api.cache_get = lambda *_a, **_k: None
    api.cache_get_stale = lambda _key: (
        {"cells": {"open_interest": {"value": 9}}, "fetchedAt": "2026-10-21T00:00:00Z"},
        80.0,
    )
    api._kick_snapshot_build = lambda: None
    api._finalize_snapshot_payload = lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("stale"))
    try:
        out = api.get_snapshot_payload(refresh=False)
    finally:
        api.cache_get, api.cache_get_stale, api._kick_snapshot_build, api._finalize_snapshot_payload = saved
    assert out["stale"] is True
    assert out["fromCache"] is True
    assert out["cells"]["open_interest"]["value"] == 9
    assert out.get("unavailable") is not True


def test_snapshot_cache_hit_restamps_netflow_preliminary():
    import btc_indicators_api as api

    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    cells = {key: {"value": 1, "preliminary": False} for key in api._SNAPSHOT_LIVE_KEYS}
    snap = {"cells": cells, "fetchedAt": "2026-10-22T00:00:00Z"}
    series = {
        "series": [{"date": yesterday, "value": -4, "cmStatus": "flash"}],
        "latest": {"date": yesterday, "value": -4, "cmStatus": "flash", "preliminary": False},
    }

    def fake_get(key, ttl=None):
        if key == api._SNAPSHOT_CACHE_KEY:
            return snap
        if key == "btc:cm:v1:exchange_netflow:90":
            return series
        return None

    saved_get = api.cache_get
    saved_final = api._finalize_snapshot_payload
    api.cache_get = fake_get
    api._finalize_snapshot_payload = lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("finalize"))
    try:
        out = api.get_snapshot_payload(refresh=False)
    finally:
        api.cache_get = saved_get
        api._finalize_snapshot_payload = saved_final
    assert out["fromCache"] is True
    assert out["cells"]["exchange_netflow"]["preliminary"] is True
    assert out["cells"]["open_interest"]["value"] == 1


def test_snapshot_cache_hit_leaves_preliminary_when_the_series_cache_misses():
    import btc_indicators_api as api

    cells = {key: {"value": 1, "preliminary": True} for key in api._SNAPSHOT_LIVE_KEYS}
    snap = {"cells": cells, "fetchedAt": "2026-10-22T00:00:00Z"}
    saved_get = api.cache_get
    api.cache_get = lambda key, ttl=None: snap if key == api._SNAPSHOT_CACHE_KEY else None
    try:
        out = api.get_snapshot_payload(refresh=False)
    finally:
        api.cache_get = saved_get
    assert out["fromCache"] is True
    assert out["cells"]["exchange_netflow"]["preliminary"] is True


def test_blockchair_430_serves_last_good_then_backs_off(monkeypatch):
    import btc_data.sources.blockchair as bc

    bc._BACKOFF_UNTIL = 0.0
    good = {"series": [{"snapshot": {"difficulty": 5}}], "latest": {"snapshot": {"difficulty": 5}}}
    monkeypatch.setattr(bc, "cache_get_stale", lambda _key: (good, 12.0))

    def boom(*_a, **_k):
        raise urllib.error.HTTPError(
            "https://api.blockchair.com/bitcoin/stats", 430, "limit", {}, None
        )

    monkeypatch.setattr(bc, "fetch_json", boom)
    try:
        out = bc.fetch(object(), refresh=True)
        assert out["stale"] is True
        assert out["series"]
        assert "430" in out["reason"]
        assert bc._BACKOFF_UNTIL > time.time()
        calls = {"n": 0}

        def later(*_a, **_k):
            calls["n"] += 1
            raise AssertionError("live fetch during backoff")

        monkeypatch.setattr(bc, "fetch_json", later)
        again = bc.fetch(object(), refresh=True)
        assert calls["n"] == 0
        assert again["stale"] is True
        assert again["fromCache"] is True
    finally:
        bc._BACKOFF_UNTIL = 0.0


def test_blockchair_430_without_a_copy_is_unavailable(monkeypatch):
    import btc_data.sources.blockchair as bc

    bc._BACKOFF_UNTIL = 0.0
    monkeypatch.setattr(bc, "cache_get_stale", lambda _key: None)
    monkeypatch.setattr("btc_data.store.read_series", lambda *_a, **_k: None)

    def boom(*_a, **_k):
        raise urllib.error.HTTPError(
            "https://api.blockchair.com/bitcoin/stats", 429, "limit", {}, None
        )

    monkeypatch.setattr(bc, "fetch_json", boom)
    try:
        out = bc.fetch(object(), refresh=True)
    finally:
        bc._BACKOFF_UNTIL = 0.0
    assert out["unavailable"] is True
    assert out["stale"] is True
    assert out["series"] == []
    assert "429" in out["reason"]


def test_empty_error_series_is_not_written(monkeypatch):
    import btc_data.scheduler as sch
    from btc_data.registry import MetricSpec

    written = []
    monkeypatch.setattr(sch, "fetch_metric", lambda spec, refresh=True: {"error": "HTTP 430", "series": []})
    monkeypatch.setattr(sch, "write_series", lambda *args, **kwargs: written.append(args) or True)
    monkeypatch.setattr(sch, "read_scheduler_state", lambda: {"errors": {}})
    monkeypatch.setattr(sch, "write_scheduler_state", lambda state: None)
    monkeypatch.setattr(sch, "append_run_log", lambda entry: None)
    monkeypatch.setattr(sch, "_can_fetch_source", lambda *_a, **_k: True)
    monkeypatch.setattr(sch, "_mark_source_fetch", lambda *_a, **_k: None)
    spec = MetricSpec(id="blockchair_stats", label="Blockchair", source="Blockchair", source_key="blockchair")
    entry = sch.fetch_and_store(spec, refresh=True)
    assert written == []
    assert entry["ok"] is False


def _filled_cells():
    return {
        "hash_rate": {"value": 600},
        "hashprice": {"value": 40},
        "funding_rate": {"value": 0.01},
        "wealth_top10_pct": {"value": 15},
        "rich_top100_pct": {"value": 15},
        "rich_top1000_pct": {"value": 14},
        "delta_balanced_price": {"value": 50000},
    }


def test_repair_uses_mempool_difficulty(monkeypatch):
    import btc_indicators_api as api

    monkeypatch.setattr(api, "_store_series_body", lambda *_a, **_k: None)
    monkeypatch.setattr(api, "_blockchair_difficulty_from_store", lambda: None)
    monkeypatch.setattr(api, "_mempool_difficulty", lambda **_k: 140577680051919.6)
    monkeypatch.setattr("btc_data.valuation_models._fetch_model_series", lambda *_a, **_k: {})
    cells = _filled_cells()
    api._repair_snapshot_cells(cells, allow_live=True)
    assert cells["difficulty"]["source"] == "Mempool.space"
    assert cells["difficulty"]["value"] == 140577680051919.6
    assert cells["difficulty_ribbon"]["value"] == cells["difficulty"]["value"]
    assert cells["difficulty"].get("unavailable") is not True


def test_repair_marks_difficulty_unavailable(monkeypatch):
    import btc_indicators_api as api

    monkeypatch.setattr(api, "_store_series_body", lambda *_a, **_k: None)
    monkeypatch.setattr(api, "_blockchair_difficulty_from_store", lambda: None)
    monkeypatch.setattr(api, "_mempool_difficulty", lambda **_k: None)
    monkeypatch.setattr("btc_data.valuation_models._fetch_model_series", lambda *_a, **_k: {})
    cells = _filled_cells()
    api._repair_snapshot_cells(cells, allow_live=False)
    assert cells["difficulty"]["unavailable"] is True
    assert cells["difficulty"]["value"] is None
    assert "mempool" in cells["difficulty"]["reason"]
    assert cells["difficulty_ribbon"]["unavailable"] is True


def test_skew_tie_out_uses_forward_delta_and_weights():
    from options_skew import risk_reversal_25d

    now = 1_700_000_000_000

    def chain(exp, forward=None):
        rows = []
        for strike in range(40_000, 201_000, 10_000):
            iv = 40 + abs(strike - 100_000) / 2_000
            for side in ("C", "P"):
                row = {
                    "expiry": exp,
                    "strike": strike,
                    "side": side,
                    "mark_iv": iv + (4 if side == "P" else 0),
                }
                if forward is not None:
                    row["underlying_price"] = forward
                rows.append(row)
        return rows

    exp_near = now + 10 * 86_400_000
    exp_far = now + 50 * 86_400_000
    found = risk_reversal_25d(chain(exp_near) + chain(exp_far), 100_000, now_ms=now)
    assert found["skew25"] is not None
    assert len(found["legs"]) == 2
    assert abs(sum(leg["weight"] for leg in found["legs"]) - 1) < 1e-6
    assert abs(found["legs"][1]["weight"] - 0.5) < 1e-6
    assert "30d" in found["method"]
    assert "forward" in found["method"]
    assert found["deltaConvention"] == "forward"
    assert found["premiumAdjusted"] is False
    assert "forward delta, not premium-adjusted" in found["tieOut"]
    assert found["legs"][0]["expiry"] in found["tieOut"]
    assert found["legs"][1]["expiry"] in found["tieOut"]
    same = risk_reversal_25d(
        chain(exp_near, 100_000) + chain(exp_far, 100_000),
        100_000,
        now_ms=now,
    )
    assert abs(same["skew25"] - found["skew25"]) < 1e-6
    bumped = risk_reversal_25d(
        chain(exp_near, 300_000) + chain(exp_far, 300_000),
        100_000,
        now_ms=now,
    )
    assert bumped.get("skew25") != found["skew25"]


def test_whale_net_ignores_change_sent_back_to_an_input():
    from macro_data.misc_whales import _enrich_tx

    partial = {
        "txid": "partial",
        "vout": [
            {"scriptpubkey_address": "addrA", "value": int(866 * 1e8)},
            {"scriptpubkey_address": "addrB", "value": int(300 * 1e8)},
        ],
        "vin": [{"prevout": {"scriptpubkey_address": "addrA", "value": int(1166 * 1e8)}}],
    }
    row = _enrich_tx(partial, source="block")
    assert row is not None
    assert row["netBtc"] == 300
    assert row["grossBtc"] == 1166
    assert row["valueBtc"] == 300
    pure = {
        "vout": [
            {"scriptpubkey_address": "addrA", "value": int(20 * 1e8)},
        ],
        "vin": [{"prevout": {"scriptpubkey_address": "addrA", "value": int(20 * 1e8)}}],
    }
    assert _enrich_tx(pure, source="block") is None


def test_unlocked_ladder_title_says_relative_value():
    from macro_drivers_prediction_markets import _find_monotonicity_arbs

    def leg(strike, yes, **extra):
        return {
            "id": f"poly-{strike}",
            "question": f"Will Bitcoin be above ${strike:,}?",
            "eventTitle": "BTC ladder",
            "platform": "polymarket",
            "yesOdds": yes,
            "noOdds": 1 - yes,
            "endDate": "2026-12-31",
            "active": True,
            "resolved": False,
            "liquidity": 50_000,
            "volume24h": 50_000,
            "quotedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            **extra,
        }

    plain = _find_monotonicity_arbs([leg(100000, 0.40), leg(110000, 0.70)])
    assert plain[0]["locked"] is False
    assert plain[0]["typeLabel"] == "Strike ladder (relative value, no depth)"
    assert plain[0]["title"].startswith("Strike ladder (relative value, no depth)")
    deep = _find_monotonicity_arbs([
        leg(100000, 0.40, yesDepthUsd=250, book={"yes": [[0.40, 1000]]}),
        leg(110000, 0.70, noDepthUsd=250, book={"no": [[0.30, 1000]]}),
    ])
    assert deep[0]["locked"] is True
    assert deep[0]["typeLabel"] == "Strike ladder lock"
    assert deep[0]["title"].startswith("Strike ladder lock")


def test_spot_quote_labels_the_median_last(monkeypatch):
    import market_feed

    rows = [
        {"price": 100, "exchange": "a", "bid": 99, "ask": 101},
        {"price": 110, "exchange": "b", "bid": 109, "ask": 111},
        {"price": 120, "exchange": "c", "bid": 119, "ask": 121},
    ]
    monkeypatch.setattr(market_feed, "_exchange_spot_rows", lambda **_k: (rows, "2026-10-22T18:00:00Z"))
    monkeypatch.setattr(market_feed, "_cache_get", lambda *_a, **_k: None)
    monkeypatch.setattr(market_feed, "_cache_set", lambda _key, val: val)
    out = market_feed.get_spot_quote(refresh=True)
    assert out["ticker"]["lastPrice"] == "110.00"
    assert out["ticker"]["weightedAvgPrice"] == "110.00"
    assert out["priceSource"] == "median last"
    assert out["quotedAt"] == "2026-10-22T18:00:00Z"
    assert out["fetchedAt"] == out["quotedAt"]
