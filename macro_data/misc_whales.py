"""Whale proxy metrics — Mempool.space free API only.

Route: GET /api/misc/whales?refresh=1
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

from macro_data.cache import cache_get, cache_set

MEMPOOL = "https://mempool.space/api"
USER_AGENT = "BTC-Dashboard/1.0 (+misc-whales)"
CACHE_TTL = 180
LARGE_BTC = 100.0
LARGE_SATS = int(LARGE_BTC * 1e8)
DAY_SEC = 86_400
HOUR_SEC = 3_600

# Configurable major exchange / custody hot & cold wallets (public labels)
EXCHANGE_ADDRESSES = [
    {"label": "Binance Cold", "exchange": "Binance", "address": "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo"},
    {"label": "Binance Cold 2", "exchange": "Binance", "address": "3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6"},
    {"label": "Robinhood Cold", "exchange": "Robinhood", "address": "bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2"},
    {"label": "Bitfinex Cold", "exchange": "Bitfinex", "address": "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97"},
    {"label": "Binance BTCB", "exchange": "Binance", "address": "3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb"},
    {"label": "OKX", "exchange": "OKX", "address": "3MgEAFWu1HKSnZ5ZsC8qf61ZW18xrP5pgd"},
    {"label": "Crypto.com Cold", "exchange": "Crypto.com", "address": "bc1qr4dl5wa7kl8yu792dceg9z5knl2gkn220lk7a9"},
    {"label": "Binance Pool", "exchange": "Binance", "address": "bc1qx9t2l3pyny2spqpqlye8svce70nppwtaxwdrp4"},
]

# BitInfoCharts distribution snapshot (addresses count, public page)
RICH_SNAPSHOT = {
    "gt100btc": {"count": 17981, "source": "BitInfoCharts snapshot"},
    "gt1000btc": {"count": 1947, "source": "BitInfoCharts snapshot"},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _fetch_json(url: str, *, timeout: int = 30) -> object:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _balance_btc(chain_stats: dict) -> float:
    funded = chain_stats.get("funded_txo_sum") or 0
    spent = chain_stats.get("spent_txo_sum") or 0
    return (funded - spent) / 1e8


def _tx_output_btc(tx: dict) -> float:
    return sum((v.get("value") or 0) for v in (tx.get("vout") or [])) / 1e8


def _address_flows(txs: list, address: str, *, cutoff: int) -> dict:
    inflow = outflow = 0.0
    tx_count = 0
    for tx in txs:
        status = tx.get("status") or {}
        block_time = status.get("block_time")
        if not block_time or block_time < cutoff:
            continue
        tx_count += 1
        for vout in tx.get("vout") or []:
            if vout.get("scriptpubkey_address") == address:
                inflow += (vout.get("value") or 0) / 1e8
        for vin in tx.get("vin") or []:
            if vin.get("is_coinbase"):
                continue
            prevout = vin.get("prevout") or {}
            if prevout.get("scriptpubkey_address") == address:
                outflow += (prevout.get("value") or 0) / 1e8
    return {"inflowBtc": round(inflow, 4), "outflowBtc": round(outflow, 4), "txCount24h": tx_count}


def _scan_large_txs(txs: list, *, source: str, block_time: int | None = None) -> list[dict]:
    found = []
    for tx in txs:
        value_btc = _tx_output_btc(tx)
        if value_btc < LARGE_BTC:
            continue
        status = tx.get("status") or {}
        ts = block_time or status.get("block_time") or int(time.time())
        found.append(
            {
                "txid": tx.get("txid", ""),
                "valueBtc": round(value_btc, 2),
                "feeSat": tx.get("fee"),
                "source": source,
                "time": ts,
            }
        )
    return found


def get_misc_whales_payload(*, refresh: bool = False) -> dict:
    cache_key = "misc:whales:v1"
    if not refresh:
        cached = cache_get(cache_key, ttl=CACHE_TTL)
        if cached:
            return {**cached, "fromCache": True}

    errors: list[str] = []
    updated_at = _now_iso()
    now = int(time.time())
    cutoff_24h = now - DAY_SEC
    cutoff_1h = now - HOUR_SEC

    exchanges: list[dict] = []
    for entry in EXCHANGE_ADDRESSES:
        addr = entry["address"]
        row = {
            **entry,
            "balanceBtc": None,
            "inflow24hBtc": None,
            "outflow24hBtc": None,
            "txCount24h": None,
            "updatedAt": updated_at,
        }
        try:
            summary = _fetch_json(f"{MEMPOOL}/address/{addr}")
            row["balanceBtc"] = round(_balance_btc(summary.get("chain_stats") or {}), 4)
            txs = _fetch_json(f"{MEMPOOL}/address/{addr}/txs/chain")
            if isinstance(txs, list):
                flows = _address_flows(txs, addr, cutoff=cutoff_24h)
                row.update(
                    {
                        "inflow24hBtc": flows["inflowBtc"],
                        "outflow24hBtc": flows["outflowBtc"],
                        "txCount24h": flows["txCount24h"],
                    }
                )
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
            errors.append(f"{entry['label']}: {exc}")
        exchanges.append(row)

    large_txs: list[dict] = []
    try:
        recent = _fetch_json(f"{MEMPOOL}/mempool/recent")
        if isinstance(recent, list):
            for item in recent:
                value_btc = (item.get("value") or 0) / 1e8
                if value_btc >= LARGE_BTC:
                    large_txs.append(
                        {
                            "txid": item.get("txid", ""),
                            "valueBtc": round(value_btc, 2),
                            "source": "mempool",
                            "time": now,
                        }
                    )
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        errors.append(f"mempool recent: {exc}")

    try:
        blocks = _fetch_json(f"{MEMPOOL}/blocks")
        if isinstance(blocks, list):
            for block in blocks[:10]:
                block_hash = block.get("id")
                block_time = block.get("timestamp")
                if not block_hash:
                    continue
                try:
                    page = _fetch_json(f"{MEMPOOL}/block/{block_hash}/txs/0")
                    if isinstance(page, list):
                        large_txs.extend(_scan_large_txs(page, source="block", block_time=block_time))
                except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
                    continue
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        errors.append(f"blocks: {exc}")

    seen: set[str] = set()
    unique_large: list[dict] = []
    for tx in sorted(large_txs, key=lambda x: x.get("time") or 0, reverse=True):
        tid = tx.get("txid")
        if not tid or tid in seen:
            continue
        seen.add(tid)
        unique_large.append(tx)

    count_1h = sum(1 for t in unique_large if (t.get("time") or 0) >= cutoff_1h)
    count_24h = sum(1 for t in unique_large if (t.get("time") or 0) >= cutoff_24h)
    vol_1h = round(sum(t["valueBtc"] for t in unique_large if (t.get("time") or 0) >= cutoff_1h), 2)
    vol_24h = round(sum(t["valueBtc"] for t in unique_large if (t.get("time") or 0) >= cutoff_24h), 2)

    hourly: list[int] = [0] * 24
    for tx in unique_large:
        ts = tx.get("time") or 0
        if ts < cutoff_24h:
            continue
        age_h = min(23, max(0, (now - ts) // HOUR_SEC))
        hourly[23 - age_h] += 1
    hourly.reverse()

    dormant_score = None
    dormant_label = "Normal"
    if count_24h > 0:
        dormant_score = round(min(100.0, (count_1h / max(count_24h / 24.0, 0.05)) * 25.0), 1)
        if dormant_score >= 70:
            dormant_label = "Spike — large-value burst"
        elif dormant_score >= 40:
            dormant_label = "Elevated activity"
        old_coin_hits = sum(1 for t in unique_large[:20] if t.get("valueBtc", 0) >= LARGE_BTC)
        if old_coin_hits >= 3 and count_1h >= 2:
            dormant_label = "Possible old-coin movement (proxy)"

    tracked_gt100 = sum(1 for e in exchanges if (e.get("balanceBtc") or 0) >= 100)
    tracked_gt1000 = sum(1 for e in exchanges if (e.get("balanceBtc") or 0) >= 1000)
    tracked_balance = round(sum(e.get("balanceBtc") or 0 for e in exchanges), 2)

    payload = {
        "updatedAt": updated_at,
        "source": "live" if not errors else "live+partial",
        "errors": errors,
        "fromCache": False,
        "exchanges": exchanges,
        "largeTx": {
            "thresholdBtc": LARGE_BTC,
            "count1h": count_1h,
            "count24h": count_24h,
            "volume1hBtc": vol_1h,
            "volume24hBtc": vol_24h,
            "sparkline": hourly,
            "recent": unique_large[:12],
        },
        "dormant": {
            "score": dormant_score,
            "label": dormant_label,
            "description": "CDD-style proxy: spikes in ≥100 BTC movements vs 24h baseline. Full coin-age labeling needs paid analytics.",
        },
        "richAddresses": {
            "gt100btc": {**RICH_SNAPSHOT["gt100btc"], "trackedProxy": tracked_gt100},
            "gt1000btc": {**RICH_SNAPSHOT["gt1000btc"], "trackedProxy": tracked_gt1000},
            "trackedBalanceBtc": tracked_balance,
            "note": "Global counts are public snapshots; tracked row counts labeled exchange wallets in this panel.",
        },
        "heroes": [
            {"name": "Large txs (1h)", "value": str(count_1h), "sub": f"{vol_1h:,.0f} BTC moved"},
            {"name": "Large txs (24h)", "value": str(count_24h), "sub": f"{vol_24h:,.0f} BTC moved"},
            {"name": "Dormant proxy", "value": str(dormant_score) if dormant_score is not None else "—", "sub": dormant_label},
            {"name": "Tracked balance", "value": f"{tracked_balance:,.0f} BTC", "sub": f"{len(EXCHANGE_ADDRESSES)} exchange wallets"},
        ],
        "about": [
            "Whale proxies use Mempool.space free APIs — no keys. Exchange labels are best-effort public hot/cold examples.",
            "Large-tx scan samples mempool recent + first page of txs from the last 10 blocks (not exhaustive).",
            "Full entity attribution, precise CDD, and live rich-list counts require paid Glassnode/Chainalysis-class data.",
        ],
    }
    cache_set(cache_key, payload)
    return payload