"""Central catalog of Bitcoin metrics for prefetch, store, and API layers."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from typing import Any

from btc_data.config import BGEOMETRICS_TTL, BITINFO_TTL
from btc_data.fetchers import BGEOMETRICS_SERIES

# TTL tiers (seconds)
TTL_HOT = 900       # 15 min — mempool, blockchair snapshot
TTL_WARM = 21_600   # 6 h — coin metrics, blockchain, santiment
TTL_COLD = BGEOMETRICS_TTL  # 24 h — bgeometrics
TTL_DUNE = 86_400   # 24 h — dune queries (credit-conscious)

SOURCE_LIMITS: dict[str, dict[str, Any]] = {
    "bgeometrics": {"perHour": 8, "perDay": 15, "minIntervalSec": 480, "history": "4 years"},
    "coinmetrics": {"per6Sec": 10, "minIntervalSec": 0.7, "history": "community catalog"},
    "blockchain": {"minIntervalSec": 1.0, "history": "varies by chart"},
    "mempool": {"minIntervalSec": 2.0, "history": "live"},
    "blockchair": {"minIntervalSec": 5.0, "history": "snapshot"},
    "santiment": {"monthly": 1000, "perMinute": 100, "minIntervalSec": 1.0},
    "dune": {"lowRpm": 15, "highRpm": 40, "minIntervalSec": 4.0, "note": "credits per execution"},
    "bitinfo": {"ttl": BITINFO_TTL},
}


@dataclass
class MetricSpec:
    id: str
    label: str
    source: str
    source_key: str
    tier: str = "cold"
    ttl: int = TTL_COLD
    priority: int = 50
    unit: str = ""
    format: str = "ratio"
    tab: str = ""
    enabled: bool = True
    requires_key: bool = False
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _bgeometrics_specs() -> list[MetricSpec]:
    labels = {
        "mvrv": ("MVRV", "valuation", "×", "ratio", 10),
        "mvrv_z_score": ("MVRV Z-Score", "valuation", "σ", "zscore", 11),
        "realized_price": ("Realized price", "valuation", "USD", "usd", 12),
        "nupl": ("NUPL", "valuation", "ratio", "ratio", 13),
        "sopr": ("SOPR", "valuation", "×", "ratio", 14),
        "supply_in_profit": ("Supply in profit", "valuation", "%", "pct", 15),
        "hodl_waves": ("HODL waves (1y+ proxy)", "valuation", "%", "pct", 16),
        "puell_multiple": ("Puell Multiple", "onchain", "×", "ratio", 20),
        "bitcoin_dominance": ("BTC dominance", "sentiment", "%", "pct", 30),
        "etf_flow_btc": ("ETF net flow", "sentiment", "BTC", "btc", 31),
        "btc_price": ("BTC price", "valuation_models", "USD", "usd", 5),
        "supply_current": ("Circulating supply", "valuation_models", "BTC", "btc", 40),
        "delta_cap": ("Delta cap", "valuation_models", "USD", "usd", 22),
        "investor_price": ("Investor price", "valuation_models", "USD", "usd", 23),
        "thermo_price": ("Thermo price", "valuation_models", "USD", "usd", 24),
        "cdd": ("Coin days destroyed", "valuation_models", "CDD", "ratio", 25),
        "cdd_90dma": ("CDD 90d MA", "valuation_models", "CDD", "ratio", 26),
        "hashribbons": ("Hash ribbons", "valuation_models", "signal", "ratio", 27),
        "difficulty": ("Difficulty", "valuation_models", "diff", "large_int", 28),
        "nvts": ("NVT Signal", "valuation_models", "×", "ratio", 29),
        # Phase 2 — registered now for prefetch queue
        "sth_mvrv": ("STH MVRV", "intelligence", "×", "ratio", 17),
        "lth_mvrv": ("LTH MVRV", "intelligence", "×", "ratio", 18),
        "sth_nupl": ("STH NUPL", "intelligence", "ratio", "ratio", 19),
        "lth_nupl": ("LTH NUPL", "intelligence", "ratio", "ratio", 20),
        "asopr": ("ASOPR", "intelligence", "×", "ratio", 21),
        "vdd_multiple": ("VDD multiple", "intelligence", "×", "ratio", 22),
        "terminal_price": ("Terminal price", "valuation_models", "USD", "usd", 23),
        "nrpl_usd": ("Net realized P/L (USD)", "intelligence", "USD", "usd", 24),
        "hashprice": ("Hashprice", "miner", "USD", "usd_precise", 32),
        "hashrate_bg": ("Hash rate (BGeometrics)", "miner", "EH/s", "hashrate", 33),
        "etf_btc_total": ("ETF BTC total", "sentiment", "BTC", "btc", 34),
        "stablecoin_supply": ("Stablecoin supply", "sentiment", "USD", "usd", 35),
        "utxos_in_profit_pct": ("UTXOs in profit %", "intelligence", "%", "pct", 36),
    }
    bg_keys = {
        **{k: k for k in BGEOMETRICS_SERIES},
        "sth_mvrv": "sth-mvrv",
        "lth_mvrv": "lth-mvrv",
        "sth_nupl": "nupl-sth",
        "lth_nupl": "nupl-lth",
        "asopr": "asopr",
        "vdd_multiple": "vdd-multiple",
        "terminal_price": "terminal-price",
        "nrpl_usd": "nrpl-usd",
        "hashprice": "hashprice",
        "hashrate_bg": "hashrate",
        "etf_btc_total": "etf-btc-total",
        "stablecoin_supply": "stablecoin-supply",
        "utxos_in_profit_pct": "utxos-in-profit-pct",
    }
    specs: list[MetricSpec] = []
    for mid in sorted(set(bg_keys) | set(BGEOMETRICS_SERIES)):
        meta = labels.get(mid, (mid.replace("_", " ").title(), "", "", "ratio", 50))
        label, tab, unit, fmt, prio = meta
        specs.append(
            MetricSpec(
                id=mid,
                label=label,
                source="bgeometrics",
                source_key=mid,
                tier="cold",
                ttl=TTL_COLD,
                priority=prio,
                unit=unit,
                format=fmt,
                tab=tab,
                enabled=mid in BGEOMETRICS_SERIES,
            )
        )
    return specs


def _coinmetrics_specs() -> list[MetricSpec]:
    rows = [
        ("exchange_inflow", "Exchange inflow", "onchain", "BTC", "btc", 40),
        ("exchange_outflow", "Exchange outflow", "onchain", "BTC", "btc", 41),
        ("exchange_balance", "Exchange balance", "onchain", "BTC", "btc", 42),
        ("tx_count", "Transaction count", "onchain", "tx/day", "large_int", 43),
    ]
    return [
        MetricSpec(
            id=mid,
            label=label,
            source="coinmetrics",
            source_key=mid,
            tier="warm",
            ttl=TTL_WARM,
            priority=prio,
            unit=unit,
            format=fmt,
            tab=tab,
        )
        for mid, label, tab, unit, fmt, prio in rows
    ]


def _blockchain_specs() -> list[MetricSpec]:
    rows = [
        ("active_addresses", "Active addresses", "n-unique-addresses", "onchain", "addresses", "large_int", 44),
        ("hash_rate", "Hash rate", "hash-rate", "onchain", "EH/s", "hashrate", 45),
        ("market_price", "Market price", "market-price", "valuation_models", "USD", "usd", 6),
        ("miners_revenue", "Miners revenue", "miners-revenue", "miner", "USD", "usd", 46),
    ]
    return [
        MetricSpec(
            id=mid,
            label=label,
            source="blockchain",
            source_key=chart,
            tier="warm",
            ttl=TTL_WARM,
            priority=prio,
            unit=unit,
            format=fmt,
            tab=tab,
        )
        for mid, label, chart, tab, unit, fmt, prio in rows
    ]


def _santiment_specs() -> list[MetricSpec]:
    """Santiment free-plan metrics — require SANTIMENT_API_KEY."""
    rows = [
        ("san_price_usd", "Price USD", "price_usd", "sentiment", "USD", "usd", 50),
        ("san_daily_active_addresses", "Daily active addresses", "daily_active_addresses", "intelligence", "addrs", "large_int", 51),
        ("san_transaction_volume", "Transaction volume", "transaction_volume", "intelligence", "USD", "usd", 52),
        ("san_exchange_inflow", "Exchange inflow", "exchange_inflow", "intelligence", "USD", "usd", 53),
        ("san_exchange_outflow", "Exchange outflow", "exchange_outflow", "intelligence", "USD", "usd", 54),
        ("san_mvrv_usd", "MVRV USD", "mvrv_usd", "intelligence", "×", "ratio", 55),
        ("san_social_volume_total", "Social volume", "social_volume_total", "sentiment", "posts", "large_int", 56),
    ]
    has_key = bool(os.environ.get("SANTIMENT_API_KEY", "").strip())
    return [
        MetricSpec(
            id=mid,
            label=label,
            source="santiment",
            source_key=metric,
            tier="warm",
            ttl=TTL_WARM,
            priority=prio,
            unit=unit,
            format=fmt,
            tab=tab,
            requires_key=True,
            enabled=has_key,
            notes="Santiment free plan — 1k calls/mo; restricted metrics may lag 30d",
        )
        for mid, label, metric, tab, unit, fmt, prio in rows
    ]


def _parse_dune_queries() -> list[dict[str, Any]]:
    """BTC_DUNE_QUERIES JSON or BTC_DUNE_QUERY_IDS=id:label,id:label."""
    raw_json = os.environ.get("BTC_DUNE_QUERIES", "").strip()
    if raw_json:
        try:
            parsed = json.loads(raw_json)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
    raw_ids = os.environ.get("BTC_DUNE_QUERY_IDS", "").strip()
    if not raw_ids:
        return []
    out: list[dict[str, Any]] = []
    for chunk in raw_ids.split(","):
        part = chunk.strip()
        if not part:
            continue
        if ":" in part:
            metric_id, qid = part.split(":", 1)
            out.append({
                "metricId": metric_id.strip(),
                "queryId": int(qid.strip()),
                "label": metric_id.strip().replace("_", " ").title(),
            })
        else:
            out.append({
                "metricId": f"dune_{part}",
                "queryId": int(part),
                "label": f"Dune query {part}",
            })
    return out


def _dune_specs() -> list[MetricSpec]:
    has_key = bool(os.environ.get("DUNE_API_KEY", "").strip())
    specs: list[MetricSpec] = []
    for row in _parse_dune_queries():
        mid = str(row.get("metricId") or row.get("id") or f"dune_{row.get('queryId')}")
        specs.append(
            MetricSpec(
                id=mid,
                label=str(row.get("label") or mid),
                source="dune",
                source_key=str(row.get("queryId")),
                tier="cold",
                ttl=TTL_DUNE,
                priority=60,
                unit=str(row.get("unit") or ""),
                format=str(row.get("format") or "ratio"),
                tab=str(row.get("tab") or "intelligence"),
                requires_key=True,
                enabled=has_key and bool(row.get("queryId")),
                notes="Dune community query — configure BTC_DUNE_QUERY_IDS or BTC_DUNE_QUERIES",
            )
        )
    if not specs:
        specs.append(
            MetricSpec(
                id="dune_placeholder",
                label="Dune query (configure IDs)",
                source="dune",
                source_key="",
                tier="cold",
                ttl=TTL_DUNE,
                priority=99,
                requires_key=True,
                enabled=False,
                notes="Set DUNE_API_KEY and BTC_DUNE_QUERY_IDS=e.g. whale_flow:12345",
            )
        )
    return specs


def _other_specs() -> list[MetricSpec]:
    return [
        MetricSpec(
            id="blockchair_stats",
            label="Blockchair network snapshot",
            source="blockchair",
            source_key="stats",
            tier="hot",
            ttl=TTL_HOT,
            priority=8,
            unit="mixed",
            format="json",
            tab="miner",
        ),
        MetricSpec(
            id="mempool_fees",
            label="Mempool fees",
            source="mempool",
            source_key="fees",
            tier="hot",
            ttl=TTL_HOT,
            priority=7,
            unit="sat/vB",
            format="fee_sat",
            tab="onchain",
        ),
    ]


def build_registry() -> dict[str, MetricSpec]:
    specs: list[MetricSpec] = []
    specs.extend(_bgeometrics_specs())
    specs.extend(_coinmetrics_specs())
    specs.extend(_blockchain_specs())
    specs.extend(_santiment_specs())
    specs.extend(_dune_specs())
    specs.extend(_other_specs())
    # De-dupe by id (bgeometrics block may overlap)
    out: dict[str, MetricSpec] = {}
    for spec in specs:
        if spec.id in out and not spec.enabled:
            continue
        out[spec.id] = spec
    return out


REGISTRY: dict[str, MetricSpec] = build_registry()


def registry_payload() -> dict[str, Any]:
    """Serializable catalog for API status endpoints."""
    return {
        "metrics": [s.to_dict() for s in sorted(REGISTRY.values(), key=lambda x: (x.priority, x.id))],
        "sources": SOURCE_LIMITS,
        "counts": {
            "total": len(REGISTRY),
            "enabled": sum(1 for s in REGISTRY.values() if s.enabled),
            "bgeometrics": sum(1 for s in REGISTRY.values() if s.source == "bgeometrics" and s.enabled),
            "santiment": sum(1 for s in REGISTRY.values() if s.source == "santiment" and s.enabled),
            "dune": sum(1 for s in REGISTRY.values() if s.source == "dune" and s.enabled),
        },
    }


def refresh_registry() -> None:
    """Reload env-dependent entries (Santiment, Dune)."""
    global REGISTRY
    REGISTRY = build_registry()