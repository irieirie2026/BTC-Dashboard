"""Whale / large-transfer tracker — Mempool.space free API.

Route: GET /api/misc/whales?refresh=1

Surfaces:
  · Labeled exchange / custody wallets (balance + 24h flows)
  · Large transfers (identified + unidentified) from mempool + recent blocks
  · Size tiers, direction tags, activity sparkline, dormant proxy
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
CACHE_TTL = 120
# Notable transfers start here; "whale" marketing threshold is higher
NOTABLE_BTC = 10.0
WHALE_BTC = 100.0
DAY_SEC = 86_400
HOUR_SEC = 3_600
BLOCKS_SCAN = 10
TX_PAGES = 1  # first page (~25 txs/block) — keep suite responsive

# Public best-effort labels (hot/cold / custody). Not exhaustive entity graph.
EXCHANGE_ADDRESSES = [
    {"label": "Binance Cold", "exchange": "Binance", "address": "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo"},
    {"label": "Binance Cold 2", "exchange": "Binance", "address": "3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6"},
    {"label": "Binance BTCB", "exchange": "Binance", "address": "3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb"},
    {"label": "Binance Pool", "exchange": "Binance", "address": "bc1qx9t2l3pyny2spqpqlye8svce70nppwtaxwdrp4"},
    {"label": "Robinhood Cold", "exchange": "Robinhood", "address": "bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2"},
    {"label": "Bitfinex Cold", "exchange": "Bitfinex", "address": "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97"},
    {"label": "OKX", "exchange": "OKX", "address": "3MgEAFWu1HKSnZ5ZsC8qf61ZW18xrP5pgd"},
    {"label": "Crypto.com Cold", "exchange": "Crypto.com", "address": "bc1qr4dl5wa7kl8yu792dceg9z5knl2gkn220lk7a9"},
    # Additional well-cited public cold examples (best-effort; labels can drift)
    {"label": "Bitfinex Cold 2", "exchange": "Bitfinex", "address": "3JZq4atUahhuA9rLhXLMhhTo133J9rF97j"},
]

RICH_SNAPSHOT = {
    "gt100btc": {"count": 17981, "source": "BitInfoCharts snapshot"},
    "gt1000btc": {"count": 1947, "source": "BitInfoCharts snapshot"},
}

# Address → {label, exchange}
_LABEL_MAP: dict[str, dict[str, str]] = {
    e["address"]: {"label": e["label"], "exchange": e["exchange"]} for e in EXCHANGE_ADDRESSES
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _fetch_json(url: str, *, timeout: int = 28) -> object:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _balance_btc(chain_stats: dict) -> float:
    funded = chain_stats.get("funded_txo_sum") or 0
    spent = chain_stats.get("spent_txo_sum") or 0
    return (funded - spent) / 1e8


def _size_tier(value_btc: float) -> str:
    if value_btc >= 1000:
        return "leviathan"
    if value_btc >= 500:
        return "mega"
    if value_btc >= WHALE_BTC:
        return "whale"
    if value_btc >= 50:
        return "large"
    if value_btc >= NOTABLE_BTC:
        return "notable"
    return "small"


def _lookup(addr: str | None) -> dict[str, str] | None:
    if not addr:
        return None
    return _LABEL_MAP.get(addr)


def _addr_meta(addr: str | None) -> dict:
    hit = _lookup(addr)
    if hit:
        return {
            "address": addr,
            "label": hit["label"],
            "exchange": hit["exchange"],
            "known": True,
        }
    return {
        "address": addr,
        "label": None,
        "exchange": None,
        "known": False,
    }


def _enrich_tx(tx: dict, *, source: str, block_time: int | None = None, block_height: int | None = None) -> dict | None:
    """Build a feed row for any transfer ≥ NOTABLE_BTC (identified or not)."""
    vouts = tx.get("vout") or []
    vins = tx.get("vin") or []
    out_sum = sum((v.get("value") or 0) for v in vouts)
    value_btc = out_sum / 1e8
    if value_btc < NOTABLE_BTC:
        return None

    # Dominant output (largest non-change heuristic: largest single out)
    outs = sorted(
        [
            {
                "address": v.get("scriptpubkey_address"),
                "valueBtc": round((v.get("value") or 0) / 1e8, 4),
            }
            for v in vouts
            if v.get("scriptpubkey_address")
        ],
        key=lambda x: x["valueBtc"],
        reverse=True,
    )
    # Inputs
    ins = []
    for vin in vins:
        if vin.get("is_coinbase"):
            continue
        po = vin.get("prevout") or {}
        addr = po.get("scriptpubkey_address")
        if not addr:
            continue
        ins.append(
            {
                "address": addr,
                "valueBtc": round((po.get("value") or 0) / 1e8, 4),
            }
        )
    ins = sorted(ins, key=lambda x: x["valueBtc"], reverse=True)

    from_addr = ins[0]["address"] if ins else None
    to_addr = outs[0]["address"] if outs else None
    from_m = _addr_meta(from_addr)
    to_m = _addr_meta(to_addr)

    known_in = any(_lookup(i["address"]) for i in ins)
    known_out = any(_lookup(o["address"]) for o in outs)

    if known_in and known_out:
        direction = "exchange_internal"
        directionLabel = "Exchange → exchange"
    elif known_in and not known_out:
        direction = "from_exchange"
        directionLabel = "Exchange → unknown"
    elif known_out and not known_in:
        direction = "to_exchange"
        directionLabel = "Unknown → exchange"
    elif not ins and any(v.get("is_coinbase") for v in vins):
        direction = "coinbase"
        directionLabel = "Coinbase / miner"
    else:
        direction = "unknown"
        directionLabel = "Unidentified (P2P / unlabeled)"

    status = tx.get("status") or {}
    confirmed = bool(status.get("confirmed"))
    ts = block_time or status.get("block_time") or int(time.time())
    fee = tx.get("fee")
    fee_btc = round(fee / 1e8, 6) if fee is not None else None

    return {
        "txid": tx.get("txid", ""),
        "valueBtc": round(value_btc, 4),
        "feeBtc": fee_btc,
        "feeSat": fee,
        "source": source,
        "confirmed": confirmed,
        "time": ts,
        "blockHeight": block_height or status.get("block_height"),
        "tier": _size_tier(value_btc),
        "direction": direction,
        "directionLabel": directionLabel,
        "identified": bool(known_in or known_out),
        "from": from_m,
        "to": to_m,
        "inputCount": len(ins),
        "outputCount": len(outs),
    }


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


def _btc_usd() -> float | None:
    try:
        prices = _fetch_json(f"{MEMPOOL}/v1/prices")
        if isinstance(prices, dict):
            for key in ("USD", "usd"):
                if prices.get(key) is not None:
                    return float(prices[key])
            # nested time series last
            if "time" in prices and "USD" in prices:
                return float(prices["USD"])
    except Exception:
        pass
    try:
        t = _fetch_json("https://blockchain.info/ticker")
        if isinstance(t, dict) and t.get("USD", {}).get("last"):
            return float(t["USD"]["last"])
    except Exception:
        pass
    return None


def get_misc_whales_payload(*, refresh: bool = False) -> dict:
    cache_key = "misc:whales:v3"
    if not refresh:
        cached = cache_get(cache_key, ttl=CACHE_TTL)
        if cached:
            return {**cached, "fromCache": True}

    errors: list[str] = []
    updated_at = _now_iso()
    now = int(time.time())
    cutoff_24h = now - DAY_SEC
    cutoff_1h = now - HOUR_SEC

    btc_usd = None
    try:
        btc_usd = _btc_usd()
    except Exception as exc:
        errors.append(f"price: {exc}")

    exchanges: list[dict] = []
    for entry in EXCHANGE_ADDRESSES:
        addr = entry["address"]
        row = {
            **entry,
            "balanceBtc": None,
            "inflow24hBtc": None,
            "outflow24hBtc": None,
            "net24hBtc": None,
            "txCount24h": None,
            "updatedAt": updated_at,
        }
        try:
            summary = _fetch_json(f"{MEMPOOL}/address/{addr}")
            row["balanceBtc"] = round(_balance_btc(summary.get("chain_stats") or {}), 4)
            txs = _fetch_json(f"{MEMPOOL}/address/{addr}/txs/chain")
            if isinstance(txs, list):
                flows = _address_flows(txs, addr, cutoff=cutoff_24h)
                row["inflow24hBtc"] = flows["inflowBtc"]
                row["outflow24hBtc"] = flows["outflowBtc"]
                row["net24hBtc"] = round(flows["inflowBtc"] - flows["outflowBtc"], 4)
                row["txCount24h"] = flows["txCount24h"]
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, TypeError, ValueError) as exc:
            errors.append(f"{entry['label']}: {exc}")
        exchanges.append(row)

    feed: list[dict] = []

    # Unconfirmed large mempool txs (value only in recent list — fetch full tx when large)
    try:
        recent = _fetch_json(f"{MEMPOOL}/mempool/recent")
        if isinstance(recent, list):
            candidates = []
            for item in recent:
                value_btc = (item.get("value") or 0) / 1e8
                if value_btc >= NOTABLE_BTC and item.get("txid"):
                    candidates.append(item["txid"])
            # Cap detail fetches
            for tid in candidates[:20]:
                try:
                    tx = _fetch_json(f"{MEMPOOL}/tx/{tid}")
                    if isinstance(tx, dict):
                        row = _enrich_tx(tx, source="mempool")
                        if row:
                            row["time"] = now  # unconfirmed: "seen now"
                            feed.append(row)
                except Exception:
                    # fallback bare row from recent list
                    match = next((x for x in recent if x.get("txid") == tid), None)
                    if match:
                        vb = (match.get("value") or 0) / 1e8
                        feed.append(
                            {
                                "txid": tid,
                                "valueBtc": round(vb, 4),
                                "feeBtc": None,
                                "feeSat": match.get("fee"),
                                "source": "mempool",
                                "confirmed": False,
                                "time": now,
                                "blockHeight": None,
                                "tier": _size_tier(vb),
                                "direction": "unknown",
                                "directionLabel": "Unidentified (mempool)",
                                "identified": False,
                                "from": _addr_meta(None),
                                "to": _addr_meta(None),
                                "inputCount": 0,
                                "outputCount": 0,
                            }
                        )
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        errors.append(f"mempool recent: {exc}")

    try:
        blocks = _fetch_json(f"{MEMPOOL}/blocks")
        if isinstance(blocks, list):
            for block in blocks[:BLOCKS_SCAN]:
                block_hash = block.get("id")
                block_time = block.get("timestamp")
                height = block.get("height")
                if not block_hash:
                    continue
                for page in range(TX_PAGES):
                    start = page * 25
                    try:
                        txs = _fetch_json(f"{MEMPOOL}/block/{block_hash}/txs/{start}")
                        if not isinstance(txs, list):
                            break
                        for tx in txs:
                            row = _enrich_tx(
                                tx,
                                source="block",
                                block_time=block_time,
                                block_height=height,
                            )
                            if row:
                                feed.append(row)
                        if len(txs) < 25:
                            break
                    except Exception:
                        break
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        errors.append(f"blocks: {exc}")

    seen: set[str] = set()
    unique: list[dict] = []
    for tx in sorted(feed, key=lambda x: (x.get("time") or 0, x.get("valueBtc") or 0), reverse=True):
        tid = tx.get("txid")
        if not tid or tid in seen:
            continue
        seen.add(tid)
        if btc_usd and tx.get("valueBtc") is not None:
            tx["valueUsd"] = round(float(tx["valueBtc"]) * btc_usd, 0)
        unique.append(tx)

    def _in_window(t: dict, cutoff: int) -> bool:
        return (t.get("time") or 0) >= cutoff

    recent_24 = [t for t in unique if _in_window(t, cutoff_24h)]
    recent_1h = [t for t in unique if _in_window(t, cutoff_1h)]
    whale_24 = [t for t in recent_24 if (t.get("valueBtc") or 0) >= WHALE_BTC]
    unknown_24 = [t for t in recent_24 if not t.get("identified")]
    to_ex_24 = [t for t in recent_24 if t.get("direction") == "to_exchange"]
    from_ex_24 = [t for t in recent_24 if t.get("direction") == "from_exchange"]

    count_1h = len(recent_1h)
    count_24h = len(recent_24)
    vol_1h = round(sum(t["valueBtc"] for t in recent_1h), 2)
    vol_24h = round(sum(t["valueBtc"] for t in recent_24), 2)
    whale_vol_24 = round(sum(t["valueBtc"] for t in whale_24), 2)
    unknown_vol_24 = round(sum(t["valueBtc"] for t in unknown_24), 2)

    hourly: list[int] = [0] * 24
    for tx in recent_24:
        ts = tx.get("time") or 0
        age_h = min(23, max(0, (now - ts) // HOUR_SEC))
        hourly[23 - age_h] += 1
    hourly.reverse()

    buckets = {
        "notable": sum(1 for t in recent_24 if _size_tier(t.get("valueBtc") or 0) == "notable"),
        "large": sum(1 for t in recent_24 if _size_tier(t.get("valueBtc") or 0) == "large"),
        "whale": sum(1 for t in recent_24 if _size_tier(t.get("valueBtc") or 0) == "whale"),
        "mega": sum(1 for t in recent_24 if _size_tier(t.get("valueBtc") or 0) == "mega"),
        "leviathan": sum(1 for t in recent_24 if _size_tier(t.get("valueBtc") or 0) == "leviathan"),
    }

    dormant_score = None
    dormant_label = "Normal"
    if count_24h > 0:
        dormant_score = round(min(100.0, (count_1h / max(count_24h / 24.0, 0.05)) * 25.0), 1)
        if dormant_score >= 70:
            dormant_label = "Spike — large-value burst"
        elif dormant_score >= 40:
            dormant_label = "Elevated activity"
        if count_1h >= 3 and len(whale_24) >= 2:
            dormant_label = "Heavy whale tape (proxy)"

    tracked_gt100 = sum(1 for e in exchanges if (e.get("balanceBtc") or 0) >= 100)
    tracked_gt1000 = sum(1 for e in exchanges if (e.get("balanceBtc") or 0) >= 1000)
    tracked_balance = round(sum(e.get("balanceBtc") or 0 for e in exchanges), 2)
    net_ex_in = round(sum(e.get("inflow24hBtc") or 0 for e in exchanges), 2)
    net_ex_out = round(sum(e.get("outflow24hBtc") or 0 for e in exchanges), 2)
    net_ex = round(net_ex_in - net_ex_out, 2)

    # Biggest single move in sample (by BTC, not merely newest)
    top_tx = max(unique, key=lambda t: t.get("valueBtc") or 0) if unique else None

    payload = {
        "updatedAt": updated_at,
        "source": "live" if not errors else "live+partial",
        "errors": errors,
        "fromCache": False,
        "btcUsd": btc_usd,
        "thresholds": {
            "notableBtc": NOTABLE_BTC,
            "whaleBtc": WHALE_BTC,
        },
        "exchanges": exchanges,
        "exchangeNet": {
            "inflow24hBtc": net_ex_in,
            "outflow24hBtc": net_ex_out,
            "net24hBtc": net_ex,
            "note": "Sum of tracked labeled wallets only — not full exchange universe.",
        },
        "largeTx": {
            "thresholdBtc": NOTABLE_BTC,
            "whaleThresholdBtc": WHALE_BTC,
            "count1h": count_1h,
            "count24h": count_24h,
            "volume1hBtc": vol_1h,
            "volume24hBtc": vol_24h,
            "whaleCount24h": len(whale_24),
            "whaleVolume24hBtc": whale_vol_24,
            "unknownCount24h": len(unknown_24),
            "unknownVolume24hBtc": unknown_vol_24,
            "toExchangeCount24h": len(to_ex_24),
            "fromExchangeCount24h": len(from_ex_24),
            "sparkline": hourly,
            "buckets": buckets,
            "recent": unique[:48],
            "top": top_tx,
        },
        "dormant": {
            "score": dormant_score,
            "label": dormant_label,
            "description": (
                "Activity proxy: 1h vs 24h rate of ≥10 BTC transfers in the sample window. "
                "Not true coin-days-destroyed — paid APIs needed for UTXO age."
            ),
        },
        "richAddresses": {
            "gt100btc": {**RICH_SNAPSHOT["gt100btc"], "trackedProxy": tracked_gt100},
            "gt1000btc": {**RICH_SNAPSHOT["gt1000btc"], "trackedProxy": tracked_gt1000},
            "trackedBalanceBtc": tracked_balance,
            "note": "Global counts are public snapshots; tracked row counts labeled wallets here.",
        },
        "heroes": [
            {
                "name": "Transfers (1h)",
                "value": str(count_1h),
                "sub": f"{vol_1h:,.0f} BTC · ≥{NOTABLE_BTC:g} BTC",
            },
            {
                "name": "Transfers (24h)",
                "value": str(count_24h),
                "sub": f"{vol_24h:,.0f} BTC sample vol",
            },
            {
                "name": "Unidentified (24h)",
                "value": str(len(unknown_24)),
                "sub": f"{unknown_vol_24:,.0f} BTC · no exchange label",
            },
            {
                "name": "Tracked net flow",
                "value": f"{net_ex:+,.0f} BTC",
                "sub": f"In {net_ex_in:,.0f} · Out {net_ex_out:,.0f}",
            },
        ],
        "about": [
            f"Scans mempool recent + ~{BLOCKS_SCAN} blocks (first ~{TX_PAGES * 25} txs/block) for outputs ≥{NOTABLE_BTC:g} BTC — sample-based, not exhaustive.",
            "Unidentified = neither dominant input nor output matches this panel’s public exchange labels. Still a real on-chain transfer.",
            "Direction tags (to/from exchange) use the labeled wallet set only. Full entity graphs need paid attribution.",
            "Thresholds: notable ≥10 · large ≥50 · whale ≥100 · mega ≥500 · leviathan ≥1000 BTC.",
        ],
    }
    cache_set(cache_key, payload)
    return payload
