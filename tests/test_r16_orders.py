"""r16 desk repairs: stale serve, skew brackets, empty windows, netflow status, locks."""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from pathlib import Path


def test_snapshot_serves_stale_without_recompute():
    import btc_indicators_api as api

    saved = (api.cache_get, api.cache_get_stale, api._kick_snapshot_build, api._finalize_snapshot_payload)
    api.cache_get = lambda *_args, **_kwargs: None
    api.cache_get_stale = lambda _key: (
        {"cells": {"open_interest": {"value": 2}}, "fetchedAt": "2026-10-21T00:00:00Z"},
        40.0,
    )
    api._kick_snapshot_build = lambda: None
    api._finalize_snapshot_payload = lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("stale hit must not finalize"))
    try:
        out = api.get_snapshot_payload(refresh=False)
    finally:
        api.cache_get, api.cache_get_stale, api._kick_snapshot_build, api._finalize_snapshot_payload = saved
    assert out["stale"] is True
    assert out["status"] == "STALE"
    assert out["ageSec"] == 40.0
    assert out["fromCache"] is True
    assert out["cells"]["open_interest"]["value"] == 2


def test_snapshot_shell_when_nothing_is_stored():
    import btc_indicators_api as api

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
    assert out["status"] == "STALE"
    assert out["error"] == "NO DATA"


def test_whales_do_not_wait_when_the_warm_event_is_clear():
    import macro_data.misc_whales as whales

    saved_get, saved_stale = whales.cache_get, whales.cache_get_stale
    whales.note_whale_warm_start()
    whales.cache_get = lambda *_a, **_k: None
    whales.cache_get_stale = lambda _key: None
    try:
        started = time.time()
        out = whales.get_misc_whales_payload(refresh=False)
    finally:
        whales.cache_get = saved_get
        whales.cache_get_stale = saved_stale
        whales.note_whale_warm_done()
    assert time.time() - started < 1
    assert out["status"] == "NO DATA"
    assert out["stale"] is True


def test_whales_serve_a_stale_copy():
    import macro_data.misc_whales as whales

    saved_get, saved_stale = whales.cache_get, whales.cache_get_stale
    whales.cache_get = lambda *_a, **_k: None
    whales.cache_get_stale = lambda _key: ({"heroes": [{"name": "kept"}], "largeTx": {"windowLabel": "last 10 blocks"}}, 12.0)
    try:
        out = whales.get_misc_whales_payload(refresh=False)
    finally:
        whales.cache_get = saved_get
        whales.cache_get_stale = saved_stale
    assert out["status"] == "STALE"
    assert out["ageSec"] == 12.0
    assert out["largeTx"]["windowLabel"] == "last 10 blocks"


def test_skew_interpolates_delta_and_skips_a_missing_bracket():
    from options_skew import _interp_iv, risk_reversal_25d

    assert abs(_interp_iv([(0.10, 0.40), (0.40, 0.50)], 0.25) - 0.45) < 1e-9
    assert _interp_iv([(0.30, 0.50)], 0.25) is None

    now = 1_700_000_000_000
    exp = now + 30 * 86_400_000
    missing = risk_reversal_25d(
        [
            {"expiry": exp, "strike": 100_000, "side": "C", "mark_iv": 80},
        ],
        100_000,
        now_ms=now,
    )
    assert missing["skew25"] is None
    # Wings on one side of 25 delta only. Nearest-strike would still print a number.
    one_sided = risk_reversal_25d(
        [
            {"expiry": exp, "strike": 200_000, "side": "C", "markIv": 0.50},
            {"expiry": exp, "strike": 250_000, "side": "C", "markIv": 0.55},
            {"expiry": exp, "strike": 40_000, "side": "P", "markIv": 0.70},
            {"expiry": exp, "strike": 50_000, "side": "P", "markIv": 0.60},
        ],
        100_000,
        now_ms=now,
    )
    assert one_sided["skew25"] is None

    chain = []
    for strike, iv in ((80_000, 55), (90_000, 50), (100_000, 45), (110_000, 48), (130_000, 60)):
        chain.append({"expiry": exp, "strike": strike, "side": "C", "mark_iv": iv})
        chain.append({"expiry": exp, "strike": strike, "side": "P", "mark_iv": iv + 4})
    found = risk_reversal_25d(chain, 100_000, now_ms=now)
    assert found["skew25"] is not None
    assert "30d" in found["method"] or "listed" in found["method"]


def test_empty_7d_sopr_window_is_stale():
    import btc_indicators_api as api

    now = int(time.time())
    payload = {
        "series": [{"timestamp": now - 40 * 86400, "date": "2020-01-01", "value": 1.0}],
        "latest": {"value": 1.0},
        "stale": False,
    }
    out = api._apply_timespan(payload, "7days")
    assert out["series"] == []
    assert out["latest"] is None
    assert out["stale"] is True
    assert out["unavailable"] is True
    assert out["status"] == "unavailable"
    assert out["error"] == "NO DATA"
    assert payload["stale"] is False


def test_netflow_flash_yesterday_is_preliminary_and_reviewed_is_not():
    from btc_data.coinmetrics import _flag_netflow_preliminary, _normalize_cm_rows

    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    flash = _flag_netflow_preliminary({
        "latest": {"date": yesterday, "value": 1, "cmStatus": "flash"},
        "series": [{"date": yesterday, "value": 1, "cmStatus": "flash"}],
    })
    assert flash["latestPreliminary"] is True
    assert flash["latest"]["preliminary"] is True
    reviewed = _flag_netflow_preliminary({
        "latest": {"date": yesterday, "value": 1, "cmStatus": "reviewed"},
        "series": [{"date": yesterday, "value": 1, "cmStatus": "reviewed"}],
    })
    assert reviewed["latestPreliminary"] is False
    assert reviewed["latest"].get("preliminary") is not True
    rows = _normalize_cm_rows(
        {"data": [{"time": f"{yesterday}T00:00:00.000000000Z", "FlowInExchNtv": 3.5, "FlowInExchNtv-status": "flash"}]},
        "FlowInExchNtv",
    )
    assert rows[0]["cmStatus"] == "flash"
    assert rows[0]["value"] == 3.5


def test_self_transfer_is_dropped():
    from macro_data.misc_whales import _enrich_tx

    same = {
        "vout": [
            {"scriptpubkey_address": "addrA", "value": int(20 * 1e8)},
            {"scriptpubkey_address": "addrA", "value": int(5 * 1e8)},
        ],
        "vin": [{"prevout": {"scriptpubkey_address": "addrA", "value": int(25 * 1e8)}}],
    }
    assert _enrich_tx(same, source="block") is None
    moved = {
        "vout": [{"scriptpubkey_address": "addrB", "value": int(20 * 1e8)}],
        "vin": [{"prevout": {"scriptpubkey_address": "addrA", "value": int(20 * 1e8)}}],
    }
    row = _enrich_tx(moved, source="block")
    assert row is not None
    assert row["valueBtc"] >= 10


def test_warm_interval_is_shorter_than_the_ttls_it_covers():
    import market_feed
    from server import WARM_LOOP_SEC

    assert WARM_LOOP_SEC < 900
    assert WARM_LOOP_SEC < market_feed.CACHE_TTL
    assert WARM_LOOP_SEC < market_feed.DEPTH_CACHE_TTL


def test_ladder_without_depth_drops_the_locked_tag():
    from macro_drivers_prediction_markets import (
        _depth_usd_at_quote,
        _find_monotonicity_arbs,
        _model_gap_filtered_count,
    )

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

    plain = _find_monotonicity_arbs([
        leg(100000, 0.40),
        leg(110000, 0.70),
    ])
    assert len(plain) == 1
    assert plain[0]["locked"] is False

    deep = _find_monotonicity_arbs([
        leg(100000, 0.40, yesDepthUsd=250, book={"yes": [[0.40, 1000]]}),
        leg(110000, 0.70, noDepthUsd=250, book={"no": [[0.30, 1000]]}),
    ])
    assert len(deep) == 1
    assert deep[0]["locked"] is True
    assert _depth_usd_at_quote(leg(100000, 0.40), side="yes", quote=0.40) is None
    sized = _depth_usd_at_quote(
        {"book": {"yes": [[0.40, 500], [0.50, 5000]]}},
        side="yes",
        quote=0.40,
    )
    assert sized is not None and sized >= 100
    far = _depth_usd_at_quote({"book": {"yes": [[0.90, 5000]]}}, side="yes", quote=0.40)
    assert far is None

    assert _model_gap_filtered_count([
        {
            "id": "poly-9",
            "question": "Will Bitcoin be above $100,000?",
            "active": True,
            "resolved": False,
            "liquidity": 10,
            "yesProb": 20,
        },
        {
            "id": "mock-9",
            "question": "Will Bitcoin be above $100,000?",
            "active": True,
            "resolved": False,
            "liquidity": 10,
        },
    ]) == 1


def test_series_dir_follows_the_env(monkeypatch, tmp_path: Path):
    import btc_data.store as store

    monkeypatch.setenv("BTC_SERIES_DIR", str(tmp_path / "series"))
    assert store._series_dir() == tmp_path / "series"
    monkeypatch.delenv("BTC_SERIES_DIR", raising=False)
    monkeypatch.setenv("BTC_DASH_DATA_DIR", str(tmp_path / "dash"))
    assert store._series_dir() == tmp_path / "dash" / "btc-series"
    assert store._state_file() == tmp_path / "dash" / "btc-series" / "_scheduler_state.json"
