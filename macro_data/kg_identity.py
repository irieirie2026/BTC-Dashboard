"""Entity identity registry — canonical labels, stable IDs, alias resolution."""

from __future__ import annotations

import re
from typing import TypedDict


class EntityIdentity(TypedDict):
    id: str
    canonical: str
    type: str
    aliases: frozenset[str]
    description: str


def _norm_alias(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


# id -> identity record
_ENTITY_IDENTITIES: list[EntityIdentity] = [
    {"id": "bitcoin", "canonical": "Bitcoin", "type": "asset",
     "aliases": frozenset({"bitcoin", "btc", "xbt", "₿"}),
     "description": "Primary cryptocurrency / digital asset"},
    {"id": "ethereum", "canonical": "Ethereum", "type": "asset",
     "aliases": frozenset({"ethereum", "eth"}),
     "description": "Smart-contract blockchain and ETH asset"},
    {"id": "federal-reserve", "canonical": "Federal Reserve", "type": "government_body",
     "aliases": frozenset({"federal reserve", "fed", "the fed", "fomc"}),
     "description": "US central bank"},
    {"id": "sec", "canonical": "SEC", "type": "government_body",
     "aliases": frozenset({"sec", "securities and exchange commission", "u.s. sec"}),
     "description": "US Securities and Exchange Commission"},
    {"id": "us-treasury", "canonical": "US Treasury", "type": "government_body",
     "aliases": frozenset({"us treasury", "treasury", "u.s. treasury"}),
     "description": "US federal finance department"},
    {"id": "cftc", "canonical": "CFTC", "type": "government_body",
     "aliases": frozenset({"cftc"}), "description": "US derivatives regulator"},
    {"id": "ecb", "canonical": "ECB", "type": "government_body",
     "aliases": frozenset({"ecb", "european central bank"}), "description": "European Central Bank"},
    {"id": "blackrock", "canonical": "BlackRock", "type": "financial_institution",
     "aliases": frozenset({"blackrock", "black rock"}),
     "description": "Asset manager issuing spot Bitcoin ETF"},
    {"id": "grayscale", "canonical": "Grayscale", "type": "financial_institution",
     "aliases": frozenset({"grayscale", "greyscale"}),
     "description": "Crypto asset manager (GBTC issuer)"},
    {"id": "fidelity", "canonical": "Fidelity", "type": "financial_institution",
     "aliases": frozenset({"fidelity"}), "description": "Asset manager with Bitcoin products"},
    {"id": "coinbase", "canonical": "Coinbase", "type": "financial_institution",
     "aliases": frozenset({"coinbase"}), "description": "US-listed crypto exchange"},
    {"id": "binance", "canonical": "Binance", "type": "financial_institution",
     "aliases": frozenset({"binance"}), "description": "Global crypto exchange"},
    {"id": "microstrategy", "canonical": "MicroStrategy", "type": "org",
     "aliases": frozenset({"microstrategy", "micro strategy", "mstr"}),
     "description": "Public company holding Bitcoin treasury"},
    {"id": "gary-gensler", "canonical": "Gary Gensler", "type": "person",
     "aliases": frozenset({"gary gensler", "gensler"}),
     "description": "Former SEC chair referenced in crypto regulation coverage"},
    {"id": "jerome-powell", "canonical": "Jerome Powell", "type": "person",
     "aliases": frozenset({"jerome powell", "jay powell", "powell"}),
     "description": "Federal Reserve chair"},
    {"id": "michael-saylor", "canonical": "Michael Saylor", "type": "person",
     "aliases": frozenset({"michael saylor", "saylor michael", "saylor"}),
     "description": "MicroStrategy executive and Bitcoin advocate"},
    {"id": "cathie-wood", "canonical": "Cathie Wood", "type": "person",
     "aliases": frozenset({"cathie wood", "wood cathie"}),
     "description": "ARK Invest CEO and macro/crypto commentator"},
    {"id": "larry-fink", "canonical": "Larry Fink", "type": "person",
     "aliases": frozenset({"larry fink", "fink larry"}),
     "description": "BlackRock CEO"},
    {"id": "brian-armstrong", "canonical": "Brian Armstrong", "type": "person",
     "aliases": frozenset({"brian armstrong", "armstrong brian"}),
     "description": "Coinbase CEO"},
    {"id": "changpeng-zhao", "canonical": "Changpeng Zhao", "type": "person",
     "aliases": frozenset({"changpeng zhao", "zhao changpeng", "cz"}),
     "description": "Binance founder"},
    {"id": "hash-rate", "canonical": "Hash Rate", "type": "metric",
     "aliases": frozenset({"hash rate", "hashrate", "hash-rate"}),
     "description": "Mining network compute power"},
    {"id": "interest-rates", "canonical": "Interest Rates", "type": "indicator",
     "aliases": frozenset({"interest rates", "interest rate", "interest-rates"}),
     "description": "Benchmark borrowing costs"},
    {"id": "spot-bitcoin-etf", "canonical": "Spot Bitcoin ETF", "type": "product",
     "aliases": frozenset({"spot bitcoin etf", "bitcoin etf", "spot btc etf", "spot etf", "etf"}),
     "description": "Exchange-traded fund holding spot Bitcoin"},
    {"id": "gbtc", "canonical": "GBTC", "type": "product",
     "aliases": frozenset({"gbtc", "grayscale bitcoin trust"}),
     "description": "Grayscale Bitcoin Trust product"},
    {"id": "usdt", "canonical": "USDT", "type": "stablecoin",
     "aliases": frozenset({"usdt", "tether"}), "description": "Tether USD stablecoin"},
    {"id": "usdc", "canonical": "USDC", "type": "stablecoin",
     "aliases": frozenset({"usdc"}), "description": "Circle USD stablecoin"},
    {"id": "cpi", "canonical": "CPI", "type": "indicator",
     "aliases": frozenset({"cpi", "consumer price index"}),
     "description": "Consumer Price Index inflation gauge"},
    {"id": "dxy", "canonical": "US Dollar Index", "type": "market_index",
     "aliases": frozenset({"dxy", "us dollar index", "dollar index"}),
     "description": "DXY dollar strength index"},
    {"id": "sopr", "canonical": "SOPR", "type": "metric",
     "aliases": frozenset({"sopr"}), "description": "Spent Output Profit Ratio"},
    {"id": "mvrv", "canonical": "MVRV", "type": "metric",
     "aliases": frozenset({"mvrv"}), "description": "Market value to realized value ratio"},
    {"id": "halving", "canonical": "Halving", "type": "event",
     "aliases": frozenset({"halving", "bitcoin halving"}),
     "description": "Bitcoin block subsidy reduction event"},
    {"id": "lightning-network", "canonical": "Lightning Network", "type": "protocol",
     "aliases": frozenset({"lightning network", "lightning"}),
     "description": "Bitcoin layer-2 payment network"},
    {"id": "united-states", "canonical": "United States", "type": "jurisdiction",
     "aliases": frozenset({"united states", "us", "u.s.", "usa"}),
     "description": "US regulatory and macro jurisdiction"},
    {"id": "european-union", "canonical": "European Union", "type": "jurisdiction",
     "aliases": frozenset({"european union", "eu", "europe"}),
     "description": "European regulatory jurisdiction"},
]

_ALIAS_TO_IDENTITY: dict[str, EntityIdentity] = {}
_ID_BY_KEY: dict[str, EntityIdentity] = {}

for _rec in _ENTITY_IDENTITIES:
    _ID_BY_KEY[_rec["id"]] = _rec
    for _alias in _rec["aliases"]:
        _ALIAS_TO_IDENTITY[_norm_alias(_alias)] = _rec
    _ALIAS_TO_IDENTITY[_norm_alias(_rec["canonical"])] = _rec


_PERSON_NAME_RE = re.compile(
    r"^[A-Z][a-z]+(?:\s+[A-Z][.][a-z]+|\s+[A-Z][a-z]+){1,2}$"
)


def _slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s[:48] or "entity"


def _normalize_label(label: str) -> str:
    s = re.sub(r"[^a-z0-9\s]", " ", (label or "").lower())
    return re.sub(r"\s+", " ", s).strip()


def _person_dedupe_key(label: str) -> str | None:
    norm = _normalize_label(label)
    tokens = [t for t in norm.split() if len(t) >= 2]
    if len(tokens) == 2 and all(t.isalpha() for t in tokens):
        return f"person:{' '.join(sorted(tokens))}"
    if _PERSON_NAME_RE.match((label or "").strip()):
        parts = _normalize_label(label).split()
        if len(parts) >= 2:
            return f"person:{' '.join(sorted(parts[:2]))}"
    return None


def resolve_entity_identity(label: str) -> dict | None:
    """Return {id, canonical, type, description, matched} or None."""
    raw = (label or "").strip()
    if not raw:
        return None
    low = _norm_alias(raw)
    hit = _ALIAS_TO_IDENTITY.get(low)
    if not hit:
        slug = _slug(raw)
        hit = _ID_BY_KEY.get(slug)
    if not hit:
        pk = _person_dedupe_key(raw)
        if pk:
            for rec in _ENTITY_IDENTITIES:
                if rec["type"] == "person":
                    for alias in rec["aliases"]:
                        if _person_dedupe_key(alias) == pk:
                            return {
                                "id": rec["id"],
                                "canonical": rec["canonical"],
                                "type": rec["type"],
                                "description": rec["description"],
                                "matched": "person_reorder",
                            }
    if hit:
        return {
            "id": hit["id"],
            "canonical": hit["canonical"],
            "type": hit["type"],
            "description": hit["description"],
            "matched": "alias",
        }
    return None


def entity_dedupe_key(label: str, ntype: str = "") -> str:
    ident = resolve_entity_identity(label)
    if ident:
        return f"id:{ident['id']}"
    pk = _person_dedupe_key(label)
    if pk:
        return pk
    norm = _normalize_label(label)
    if ntype:
        return f"{norm}|{ntype}"
    return norm


def canonical_label(label: str) -> str:
    ident = resolve_entity_identity(label)
    if ident:
        return ident["canonical"]
    return (label or "").strip()


def identity_catalog_entry(label: str) -> tuple[str, str, str] | None:
    ident = resolve_entity_identity(label)
    if ident:
        return ident["canonical"], ident["type"], ident["description"]
    return None


def label_similarity_with_identity(a: str, b: str) -> float:
    ia, ib = resolve_entity_identity(a), resolve_entity_identity(b)
    if ia and ib and ia["id"] == ib["id"]:
        return 1.0
    na, nb = _normalize_label(a), _normalize_label(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    pa, pb = _person_dedupe_key(a), _person_dedupe_key(b)
    if pa and pb and pa == pb:
        return 1.0
    ta = set(na.split())
    tb = set(nb.split())
    if ta and tb:
        inter = len(ta & tb)
        union = len(ta | tb)
        if union and inter / union >= 0.72:
            return inter / union
        if inter >= 2 and ta == tb:
            return 1.0
    if na in nb or nb in na:
        shorter, longer = (na, nb) if len(na) <= len(nb) else (nb, na)
        if len(shorter) >= max(4, int(len(longer) * 0.6)):
            return 0.9
    return 0.0


def apply_identity_to_node(node: dict) -> dict:
    """Resolve label + id from identity registry."""
    label = (node.get("label") or node.get("id") or "").strip()
    if not label:
        return node
    ident = resolve_entity_identity(label)
    out = {**node}
    if ident:
        out["id"] = ident["id"]
        out["label"] = ident["canonical"]
        if not out.get("type") or out.get("type") == "entity":
            out["type"] = ident["type"]
        if not (out.get("description") or "").strip():
            out["description"] = ident["description"]
        out["identityId"] = ident["id"]
        out["identityMatched"] = ident.get("matched")
    else:
        out["label"] = label
        if not out.get("id"):
            out["id"] = _slug(label)
    return out


def merge_nodes_by_identity(nodes: list[dict]) -> list[dict]:
    """Collapse duplicate nodes sharing the same identity or person key."""
    by_key: dict[str, dict] = {}
    for raw in nodes:
        n = apply_identity_to_node(dict(raw))
        ntype = n.get("type") or "entity"
        key = entity_dedupe_key(n.get("label") or "", ntype)
        if key not in by_key:
            by_key[key] = n
            continue
        prev = by_key[key]
        if len(n.get("description") or "") > len(prev.get("description") or ""):
            prev["description"] = n["description"]
        conf = float(n.get("confidence") or n.get("typeConfidence") or 0)
        pconf = float(prev.get("confidence") or prev.get("typeConfidence") or 0)
        if conf > pconf:
            prev["confidence"] = n.get("confidence", conf)
            prev["typeConfidence"] = n.get("typeConfidence", conf)
    return list(by_key.values())