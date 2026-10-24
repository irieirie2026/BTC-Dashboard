"""r18 desk repairs: disk cache races, netflow status, options HAR TTL, labels."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_concurrent_sets_keep_the_disk_cache_on(tmp_path, monkeypatch):
    monkeypatch.setenv("BTC_MACRO_CACHE_DIR", str(tmp_path))
    import cache.service as svc

    svc._disk_ok = None
    errors = []

    def worker(i):
        try:
            svc.set("r18:same-key", {"i": i}, ttl=60)
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(12)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
    assert svc._disk_ok is not False
    hit = svc.get_stale("r18:same-key")
    assert hit is not None
    assert hit[0]["i"] in range(12)
    assert list(tmp_path.glob("*.json"))


def test_one_failed_write_does_not_disable_disk(tmp_path, monkeypatch):
    monkeypatch.setenv("BTC_MACRO_CACHE_DIR", str(tmp_path))
    import cache.service as svc

    svc._disk_ok = True
    real = os.replace
    calls = {"n": 0}

    def flaky(src, dst):
        calls["n"] += 1
        if calls["n"] == 1:
            raise OSError("shared temp race")
        return real(src, dst)

    monkeypatch.setattr(svc.os, "replace", flaky)
    svc.set("r18:retry", {"a": 1}, ttl=60)
    assert svc._disk_ok is True
    svc.set("r18:retry", {"a": 2}, ttl=60)
    assert svc._disk_ok is True
    hit = svc.get_stale("r18:retry")
    assert hit is not None
    assert hit[0]["a"] == 2


def test_restart_serves_persisted_copy_tagged_stale(tmp_path):
    env = os.environ.copy()
    env["BTC_MACRO_CACHE_DIR"] = str(tmp_path)
    env["BTC_DASH_DATA_DIR"] = str(tmp_path / "data")
    env["PYTHONPATH"] = str(ROOT)
    env["CACHE_BACKEND"] = "disk"
    env.pop("REDIS_URL", None)
    env.pop("PYTEST_CURRENT_TEST", None)
    write = r"""
import json, time
import cache.service as svc
payload = {
    "cells": {"open_interest": {"value": 7}},
    "fetchedAt": "2026-10-22T18:04:00Z",
    "status": "ok",
}
svc.set("btc:bundle:snapshot:v13", payload, ttl=900)
path = svc._disk_path("btc:bundle:snapshot:v13")
raw = json.loads(path.read_text(encoding="utf-8"))
raw["ts"] = time.time() - 10000
path.write_text(json.dumps(raw), encoding="utf-8")
print("wrote")
"""
    wrote = subprocess.run(
        [sys.executable, "-c", write],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    assert wrote.returncode == 0, wrote.stderr
    read = r"""
import json, time
import btc_indicators_api as api
started = time.time()
out = api.get_snapshot_payload(refresh=False)
elapsed = time.time() - started
print(json.dumps({
    "status": out.get("status"),
    "stale": out.get("stale"),
    "value": (out.get("cells") or {}).get("open_interest", {}).get("value"),
    "elapsed": elapsed,
}))
"""
    got = subprocess.run(
        [sys.executable, "-c", read],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    assert got.returncode == 0, got.stderr
    line = [row for row in got.stdout.splitlines() if row.startswith("{")][-1]
    body = json.loads(line)
    assert body["status"] == "STALE"
    assert body["stale"] is True
    assert body["value"] == 7
    assert body["elapsed"] < 2


def test_netflow_cache_without_cm_status_is_refetched(monkeypatch):
    import btc_data.coinmetrics as cm

    key = "btc:cm:v1:exchange_netflow:90"
    stored = {
        key: {
            "series": [{"date": "2026-10-21", "value": -4.0}],
            "latest": {"date": "2026-10-21", "value": -4.0},
            "fetchedAt": "2026-10-22T18:04:00Z",
        }
    }

    def fake_get(cache_key, ttl=0):
        return stored.get(cache_key)

    def fake_set(cache_key, data, ttl=None):
        stored[cache_key] = data

    def fake_series(metric_key, days_back=365, refresh=False):
        status = "flash" if metric_key == "exchange_inflow" else "reviewed"
        point = {"date": "2026-10-21", "timestamp": 1, "value": 10.0, "cmStatus": status}
        return {"series": [point], "latest": dict(point)}

    monkeypatch.setattr(cm, "cache_get", fake_get)
    monkeypatch.setattr(cm, "cache_set", fake_set)
    monkeypatch.setattr(cm, "fetch_coinmetrics_series", fake_series)
    out = cm.fetch_exchange_netflow_series(days_back=90, refresh=False)
    assert out["fromCache"] is False
    assert out["latest"]["cmStatus"] == "flash"
    assert out["latestPreliminary"] is True
    assert out["latest"]["preliminary"] is True


def test_netflow_cache_with_cm_status_is_kept(monkeypatch):
    import btc_data.coinmetrics as cm

    key = "btc:cm:v1:exchange_netflow:90"
    stored = {
        key: {
            "series": [{"date": "2026-10-21", "value": -4.0, "cmStatus": "flash"}],
            "latest": {"date": "2026-10-21", "value": -4.0, "cmStatus": "flash"},
        }
    }
    calls = {"n": 0}

    def fake_get(cache_key, ttl=0):
        return stored.get(cache_key)

    def fake_series(*_args, **_kwargs):
        calls["n"] += 1
        raise AssertionError("a body with cmStatus must not be refetched")

    monkeypatch.setattr(cm, "cache_get", fake_get)
    monkeypatch.setattr(cm, "fetch_coinmetrics_series", fake_series)
    out = cm.fetch_exchange_netflow_series(days_back=90, refresh=False)
    assert calls["n"] == 0
    assert out["fromCache"] is True
    assert out["latestPreliminary"] is True


def test_options_missing_har_is_not_cached_for_the_full_ttl(monkeypatch):
    import server

    stored = {}

    def cget(key, ttl, refresh=False):
        if refresh:
            return None
        row = stored.get(key)
        if not row:
            return None
        if time.time() - row["ts"] > ttl:
            return None
        return row["data"]

    def cset(key, data, ttl):
        stored[key] = {"ts": time.time(), "data": data, "ttl": ttl}

    partial = {
        "contracts": [{"instrument_name": "BTC-27JUN25-100000-C"}],
        "modelTermRv30d": None,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "deribit.com",
    }
    fetches = {"n": 0}

    def fetch(_html=""):
        fetches["n"] += 1
        return dict(partial)

    monkeypatch.setattr(server, "_cget", cget)
    monkeypatch.setattr(server, "_cset", cset)
    monkeypatch.setattr(server, "_fetch_options_payload", fetch)
    monkeypatch.setattr(server, "_options_term_rv_30d", lambda: {"modelTermRv30d": None})
    first = server.get_options_payload(refresh=True)
    assert first["modelTermRv30d"] is None
    assert stored["options:v3"]["ttl"] == server.OPTIONS_PARTIAL_TTL
    assert stored["options:v3"]["ttl"] < server.CACHE_TTL
    stored["options:v3"]["data"]["fetchedAt"] = time.strftime(
        "%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 10)
    )
    stored["options:v3"]["ts"] = time.time() - 10
    second = server.get_options_payload(refresh=False)
    assert second["modelTermRv30d"] is None
    assert fetches["n"] == 1
    monkeypatch.setattr(
        server,
        "_options_term_rv_30d",
        lambda: {
            "modelTermRv30d": 0.42,
            "modelTermModel": "har_rv",
            "termRv30d": 0.42,
            "termRvSource": "model term RV (HAR)",
            "termRvModel": "har_rv",
        },
    )
    third = server.get_options_payload(refresh=False)
    assert third["modelTermRv30d"] == 0.42
    assert stored["options:v3"]["ttl"] == server.CACHE_TTL
    assert fetches["n"] == 1


def test_plain_runner_refuses_live_dirs(monkeypatch):
    from tests.isolation import require_isolated_dirs

    monkeypatch.delenv("BTC_MACRO_CACHE_DIR", raising=False)
    monkeypatch.delenv("BTC_DASH_DATA_DIR", raising=False)
    try:
        require_isolated_dirs()
        raise AssertionError("unset dirs must refuse")
    except RuntimeError as exc:
        assert "live dirs" in str(exc)


def test_cross_market_cold_start_reads_exchange_disk(monkeypatch):
    import cross_market as xm

    xm._cache.clear()
    live = {"n": 0}

    def refuse_live():
        live["n"] += 1
        raise AssertionError("cold start must not fan out to venues")

    monkeypatch.setattr(xm, "_fetch_venues", refuse_live)
    monkeypatch.setattr(xm, "_fetch_fx_rates", lambda: {"KRW": 1400})
    monkeypatch.setattr(xm, "_kick_cross_market_refresh", lambda: None)
    monkeypatch.setattr(
        xm,
        "_venues_from_exchange_cache",
        lambda: (
            [
                {"exchange": "Binance", "pair": "BTC/USDT", "price": 80000.0, "ccy": "USDT", "market": "spot"},
                {"exchange": "Coinbase", "pair": "BTC/USD", "price": 80100.0, "ccy": "USD", "market": "spot"},
            ],
            [],
        ),
    )
    out = xm.get_cross_market_snapshot(refresh=False)
    assert live["n"] == 0
    assert out["fromCache"] is True
    assert out["stale"] is True
    assert len(out["venues"]) == 2
    assert out["referenceUsd"] and abs(out["referenceUsd"] - 94250) > 400
    # A warm memory entry still wins, and a forced refresh does not take the disk shortcut.
    xm._cache["cross_market:snapshot"] = {"ts": __import__("time").time(), "data": {"venues": [{"exchange": "Warm"}], "marker": "mem"}}
    warm = xm.get_cross_market_snapshot(refresh=False)
    assert warm["marker"] == "mem"


def test_whale_and_model_gap_labels():
    import inspect

    import macro_data.misc_whales as whales
    import macro_drivers_prediction_markets as pm

    whale_src = inspect.getsource(whales.get_misc_whales_payload)
    assert "Unidentified (24h)" not in whale_src
    assert "Unidentified (last 10 blocks)" in whale_src
    assert "misc:whales:v3" in inspect.getsource(whales)
    outlook = inspect.getsource(pm._build_outlook)
    commentary = inspect.getsource(pm._outlook_commentary)
    assert "arb scan" not in outlook.lower()
    assert "model gaps" in outlook.lower()
    assert "Arb scan:" not in commentary
    assert "Model gaps:" in commentary
