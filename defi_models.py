"""BTC DeFi payloads (DeFi Llama) plus protocol-risk scoring and strategy tickets."""

from __future__ import annotations

import time

DEFILLAMA_API = "https://api.llama.fi"
STABLECOINS_API = "https://stablecoins.llama.fi"
COINS_API = "https://coins.llama.fi"
YIELDS_API = "https://yields.llama.fi"

WRAP_META = {
    "wbtc": {
        "kind": "custodial",
        "issuer": "BitGo",
        "peg": "WBTC",
        "coin": "ethereum:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
        "path": "Custodian mint/burn (merchants)",
    },
    "coinbase-bridge": {
        "kind": "custodial",
        "issuer": "Coinbase",
        "peg": "cbBTC",
        "coin": "base:0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
        "path": "Coinbase mint on deposit / redeem to CEX",
    },
    "tbtc": {
        "kind": "threshold",
        "issuer": "Threshold",
        "peg": "tBTC",
        "coin": "ethereum:0x18084fba233a19d1c4999ca9f9d64e9e4f61e4ec",
        "path": "Threshold signer set + mint contracts",
    },
    "stacks-sbtc": {
        "kind": "native_l2",
        "issuer": "Stacks",
        "peg": "sBTC",
        "coin": None,
        "path": "Stacks peg-in / peg-out",
    },
    "function-fbtc": {
        "kind": "custodial",
        "issuer": "Function",
        "peg": "FBTC",
        "coin": None,
        "path": "Custodian wrap",
    },
    "lombard-lbtc": {
        "kind": "yield_wrap",
        "issuer": "Lombard",
        "peg": "LBTC",
        "coin": None,
        "path": "Babylon-staked BTC receipt",
    },
    "solvbtc": {
        "kind": "yield_wrap",
        "issuer": "Solv",
        "peg": "SolvBTC",
        "coin": None,
        "path": "Yield-bearing BTC receipt",
    },
    "lorenzo-enzobtc": {
        "kind": "yield_wrap",
        "issuer": "Lorenzo",
        "peg": "enzoBTC",
        "coin": None,
        "path": "Staked BTC receipt",
    },
    "bedrock-unibtc": {
        "kind": "yield_wrap",
        "issuer": "Bedrock",
        "peg": "uniBTC",
        "coin": None,
        "path": "Restaked BTC receipt",
    },
    "lombard-btc.b": {
        "kind": "yield_wrap",
        "issuer": "Lombard",
        "peg": "BTC.b",
        "coin": None,
        "path": "Bridged Lombard BTC",
    },
    "gtbtc": {
        "kind": "custodial",
        "issuer": "Gate",
        "peg": "GTBTC",
        "coin": None,
        "path": "Exchange wrap",
    },
}

WRAPPED_BTC_SLUGS = list(WRAP_META.keys())
WRAP_SLUG_SET = set(WRAPPED_BTC_SLUGS)

WRAPPED_BTC_PRICES = {"BTC": "coingecko:bitcoin"}
for _meta in WRAP_META.values():
    if _meta.get("coin") and _meta.get("peg"):
        WRAPPED_BTC_PRICES[_meta["peg"]] = _meta["coin"]

# Movement / routing venues — not wrap issuers (those stay on Wrapped).
BRIDGE_MOVEMENT_SLUGS = [
    "across",
    "stargate-v2",
    "hop-protocol",
    "debridge",
    "thorchain-dex",
    "chainflip-amm",
    "interlay-btc",
    "ccip",
    "layerzero-v2",
    "synapse",
    "celer-cbridge",
    "orbiter-finance",
    "rhino.fi",
    "socket",
]

BTC_NATIVE_BRIDGE_HINTS = (
    "thor",
    "chainflip",
    "interlay",
    "rootstock",
    "rsk",
    "botanix",
    "lightning",
)

STAKING_BTC_SLUGS = [
    "babylon-protocol",
    "lombard-lbtc",
    "lorenzo-enzobtc",
    "bedrock-unibtc",
    "solvbtc",
    "function-fbtc",
    "gtbtc",
    "solvbtc-lsts",
    "lombard-vaults",
]

BTC_WRAP_TICKERS = (
    "WBTC",
    "CBBTC",
    "CB-BTC",
    "TBTC",
    "LBTC",
    "SBTC",
    "SOLVBTC",
    "FBTC",
    "XBTC",
    "UNIBTC",
    "ENZOBTC",
    "BTC.B",
    "GTBTC",
)

L1_CHAINS = {"ethereum", "bitcoin", "solana", "tron", "bitcoin cash"}
L2_CHAINS = {
    "arbitrum",
    "base",
    "optimism",
    "polygon",
    "avalanche",
    "bsc",
    "binance",
    "scroll",
    "linea",
    "zksync",
    "zksync era",
    "mantle",
}

RISK_WEIGHTS = {
    "peg": 12,
    "contract": 14,
    "oracle": 8,
    "liquidity": 12,
    "yield": 10,
    "il": 10,
    "chain": 8,
    "bridge": 8,
    "admin": 10,
    "hack": 8,
}

DISCLAIMER = (
    "Educational only — not financial advice. DeFi Llama can lag; verify "
    "contracts, custodians, and mint/redeem live. Nothing here sends a transaction."
)


def _s():
    import server as srv

    return srv


def _cget(key, ttl, refresh=False):
    return _s()._cget(key, ttl, refresh=refresh)


def _cset(key, data, ttl):
    return _s()._cset(key, data, ttl)


def _ttl():
    return _s().CACHE_TTL


def _as_float(value):
    return _s()._as_float(value)


def _fetch_json(url, timeout=60):
    return _s().fetch_json(url, timeout=timeout)


def _now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _downsample_points(points, max_points=160):
    if len(points) <= max_points:
        return points
    step = max(1, len(points) // max_points)
    sampled = points[::step]
    if sampled[-1] != points[-1]:
        sampled.append(points[-1])
    return sampled


RESTAKE_HINTS = (
    "lombard",
    "babylon",
    "lbtc",
    "solv",
    "bedrock",
    "lorenzo",
    "enzo",
    "unibtc",
    "veda",
    "ether.fi",
    "restak",
)


def _looks_restake(project=None, symbol=None):
    blob = f"{project or ''} {symbol or ''}".lower()
    return any(k in blob for k in RESTAKE_HINTS)


def _apy_frac(value, project=None, symbol=None):
    """Normalize Llama APY to a 0–1 fraction for display (* 100 → percent).

    Aave-style money markets send decimals (0.00694 = 0.69%). DEX pools often
    send percent (27.6 = 27.6%). Restaked BTC receipts (LBTC) send 0.32 which
    must NOT become 32% — that is a units bug / points field, not a coupon.
    """
    x = _as_float(value)
    if x is None:
        return None
    restake = _looks_restake(project, symbol)
    if x > 1:
        x = x / 100.0
    elif restake and x >= 0.04:
        x = x / 100.0
    else:
        proj = (project or "").lower()
        lending_decimal = any(
            k in proj for k in ("aave", "compound", "spark", "morpho", "sky-lending")
        )
        if (not lending_decimal) and x >= 0.05:
            x = x / 100.0
    if restake and x > 0.04:
        x = 0.01
    return x


def _borrow_apy_frac(value):
    """lendBorrow `apyBaseBorrow` is already percent (0.37 = 0.37%, 4.67 = 4.67%)."""
    x = _as_float(value)
    if x is None:
        return None
    return x / 100.0


def _apy_view(row):
    """Split Llama headline APY from a cash stub used for ranking.

    Llama mixes units and often prints points/emissions as 'base' on restaked
    BTC receipts (e.g. LBTC ~32%). That is not Babylon's BTC coupon.
    """
    proj = (row.get("project") or row.get("name") or "")
    sym = row.get("symbol")
    headline = _apy_frac(row.get("apy"), proj, sym)
    base = _apy_frac(row.get("apyBase"), proj, sym)
    reward = _apy_frac(row.get("apyReward"), proj, sym) or 0
    il = (row.get("ilRisk") or "").lower() == "yes"
    multi = (row.get("exposure") or "").lower() == "multi"
    restake = _looks_restake(proj, row.get("symbol"))
    inflated = False
    note = None
    cash = headline
    if restake:
        note = (
            "Babylon/Lombard is restaked BTC — wrap + slash risk — not a 32% coupon. "
            "Llama units are messy on this pool; cash yield has been low-single-digit BTC (often ~1%) plus points. "
            "Do not size against a 30% headline from another site."
        )
        if headline and headline > 0.04:
            cash = 0.01
            inflated = True
    elif headline and headline > 0.08 and not il and not multi:
        cash = 0.01
        inflated = True
        note = (
            f"Llama headline {(headline or 0) * 100:.1f}% on this single-asset BTC pool is not a cash coupon. "
            "Ranked on a 1% stub."
        )
    elif headline and reward and reward / max(headline, 1e-9) > 0.65:
        cash = base if base is not None else 0.0
        inflated = True
        note = (
            f"Token rewards are {reward / headline * 100:.0f}% of the headline. "
            f"Ranked on base {(cash or 0) * 100:.2f}%."
        )
    return {
        "headline": headline,
        "cash": cash,
        "base": base,
        "reward": reward if reward else None,
        "inflated": inflated,
        "note": note,
    }


PAGE_INTROS = {
    "strategies": {
        "kicker": "What this page is",
        "lede": "Ways to earn yield on bitcoin without selling it. Every row is ranked by cash yield and by the risk stack (wrap, liquidation, second venue, dollar-coin, hack). Nothing here sends a transaction.",
        "bullets": [
            "Simplest yield: lend wrapped bitcoin (WBTC, cbBTC, tBTC) on Aave. You keep bitcoin-price exposure and earn a small interest.",
            "Dollar carry: deposit wrapped bitcoin, borrow dollars (USDC/USDT/DAI), lend those dollars where they pay more than you pay to borrow. Net = dollar earn − dollar borrow. If that number is negative, you are paying for a loan, not earning.",
            "Pool fees: put two bitcoin-IOUs in a pool and earn swap fees. Dollar-coin pools and ether pools add extra ways to lose.",
            "Paper = a worked example with our numbers (loop 1.0→1.4, levered carry, fake farm). For learning, not live size.",
        ],
    },
    "wrapped": {
        "kicker": "What this page is",
        "lede": "Bitcoin representations you hold as ERC-20s (and cousins) — not bridges, not yield. The question is who stands behind the peg.",
        "bullets": [
            "Custodial: WBTC (BitGo), cbBTC (Coinbase). Threshold: tBTC. Native L2: sBTC. Yield-bearing receipts (LBTC, Solv) are still wraps — they also sit under Staking.",
            "Peg vs spot is in basis points. Tight peg is necessary, not sufficient: you still take issuer and contract risk.",
            "This is not a place to ‘earn 32%’. That number, if Llama shows it, belongs to restaking points — see Strategies / Staking.",
        ],
    },
    "stables": {
        "kicker": "What this page is",
        "lede": "USD-pegged coins that price BTC pairs on CEX and DEX. Context for DeFi routing — not a stables farm desk.",
        "bullets": [
            "Price vs $1 in bps. ≥50 bps is peg stress.",
            "USDT/USDC dominance still sets how you enter and exit wrapped BTC.",
        ],
    },
    "bridges": {
        "kicker": "What this page is",
        "lede": "Cross-chain movement venues. Wrap issuers (WBTC, cbBTC) live under Wrapped BTC — they are not duplicated here.",
        "bullets": [
            "Native BTC paths (THORChain, Chainflip, Maya) vs WBTC routers (Across, Stargate, CCIP).",
            "TVL here is capital sitting in the router. Llama’s 24h bridge-volume API is paid, so we do not pretend to show volume.",
        ],
    },
    "lending": {
        "kicker": "What this page is",
        "lede": "Supply-side money markets for WBTC / cbBTC / tBTC. You earn the supply APY. Restaked receipts (LBTC) are under Staking, not here.",
        "bullets": [
            "APY is cash supply yield (Aave-style decimals). 0% rows (Morpho, Compound) mean you are parking collateral.",
            "To borrow against that collateral, use the Borrowing tab.",
        ],
    },
    "borrowing": {
        "kicker": "What this page is",
        "lede": "Borrow side of the same BTC money markets — what it costs to borrow the wrapped BTC, plus LTV and utilization. Liquidation is the risk, not APY cosmetics.",
        "bullets": [
            "Borrow APY is what you pay (Llama lend/borrow). LTV is the max loan-to-value; stay well below it.",
            "Utilization = borrowed / supplied. High util → rates jump and exits get harder.",
            "This is not a place to loop. Looping is a paper warning on Strategies.",
        ],
    },
    "liquidity": {
        "kicker": "What this page is",
        "lede": "BTC-containing DEX pools (not global DEX volume). Fees look fat on WBTC/ETH until IL eats them.",
        "bullets": [
            "BTC–BTC (WBTC/cbBTC/tBTC): low IL, thin fees. BTC–stable: IL if BTC trends. BTC–ETH: IL is the product.",
            "Headline APY on Uni v3 is fee APY, path-dependent — not a coupon you lock in.",
        ],
    },
    "staking": {
        "kicker": "What this page is",
        "lede": "Restaked / liquid BTC. This is not native yield on L1 Bitcoin. You stack wrap + restake + slash risk on top of BTC beta.",
        "bullets": [
            "Top table = protocols (Babylon, Lombard, Solv). Bottom table = live Llama yield pools, not mixed into TVL.",
            "Cash yield on restaked BTC is low-single-digit (often ~1%) plus points. We do not print Llama’s 0.32 field as 32%.",
        ],
    },
}


def _clamp(n, lo=0, hi=10):
    try:
        v = float(n)
    except (TypeError, ValueError):
        return lo
    return max(lo, min(hi, v))


def get_defillama_protocols():
    key = "defillama:protocols"
    cached = _cget(key, _ttl())
    if cached is not None:
        return cached
    data = _fetch_json(f"{DEFILLAMA_API}/protocols")
    by_slug = {p.get("slug"): p for p in data if p.get("slug")}
    payload = {"list": data, "by_slug": by_slug}
    _cset(key, payload, _ttl())
    return payload


def get_lend_borrow():
    key = "defillama:lend-borrow"
    cached = _cget(key, _ttl())
    if cached is not None:
        return cached
    try:
        data = _fetch_json(f"{YIELDS_API}/lendBorrow") or []
    except Exception:
        data = []
    if not isinstance(data, list):
        data = []
    by_pool = {r.get("pool"): r for r in data if r.get("pool")}
    _cset(key, by_pool, _ttl())
    return by_pool


def get_defillama_hacks():
    key = "defillama:hacks"
    cached = _cget(key, _ttl())
    if cached is not None:
        return cached
    try:
        data = _fetch_json(f"{DEFILLAMA_API}/hacks") or []
    except Exception:
        data = []
    if not isinstance(data, list):
        data = []
    _cset(key, data, _ttl())
    return data


def _names_match(a, b):
    a = (a or "").lower().strip()
    b = (b or "").lower().strip()
    if not a or not b:
        return False
    if a == b:
        return True
    if len(a) >= 5 and len(b) >= 5 and (a in b or b in a):
        return True
    return False


def _hack_for_name(hacks, name):
    if not name:
        return None
    best = None
    for h in hacks or []:
        hn = h.get("name") or ""
        if not _names_match(name, hn):
            continue
        amt = _as_float(h.get("amount")) or 0
        if best is None or amt > (_as_float(best.get("amount")) or 0):
            best = h
    if not best:
        return None
    return {
        "name": best.get("name"),
        "amount": _as_float(best.get("amount")),
        "date": best.get("date"),
        "classification": best.get("classification"),
        "bridgeHack": bool(best.get("bridgeHack")),
        "technique": best.get("technique"),
    }


def _audit_score(protocol):
    raw = protocol.get("audits") if protocol else None
    try:
        n = int(raw)
    except (TypeError, ValueError):
        n = 0
    return n


def _age_days(listed_at):
    ts = _as_float(listed_at)
    if not ts:
        return None
    return max(0, (time.time() - ts) / 86400)


def _chain_risk(chain):
    c = (chain or "").lower()
    if not c or c in {"—", "-"}:
        return 4
    if c in L1_CHAINS:
        return 1.5
    if c in L2_CHAINS:
        return 3.5
    return 6.5


def _kind_admin_risk(kind):
    return {
        "custodial": 6.5,
        "threshold": 4.5,
        "native_l2": 4.0,
        "yield_wrap": 5.5,
        "movement": 3.5,
        "lending": 3.0,
        "dex": 3.5,
        "staking": 4.0,
    }.get(kind or "", 5.0)


def score_risk(ctx):
    """Return a 0–100 fragility score (higher = worse) plus per-layer 0–10 marks."""
    layers = {}
    peg_bps = abs(_as_float(ctx.get("pegBps")) or 0)
    kind = ctx.get("kind") or ""
    layers["peg"] = _clamp(peg_bps / 40.0 + (2 if kind in {"custodial", "yield_wrap"} and peg_bps > 15 else 0))

    audits = ctx.get("audits") or 0
    age = ctx.get("ageDays")
    contract = 8.5 if audits <= 0 else (4.0 if audits == 1 else 1.6)
    if age is not None and age < 180:
        contract += 2.4
    elif age is None:
        contract += 0.6
    layers["contract"] = _clamp(contract)

    if ctx.get("needsOracle"):
        layers["oracle"] = 2.0 if ctx.get("oracles") else 6.8
    else:
        layers["oracle"] = 2.5 if ctx.get("oracles") else 3.5

    tvl = _as_float(ctx.get("tvl")) or 0
    ch7 = _as_float(ctx.get("change7d")) or 0
    liq = 1.5
    if tvl < 5e6:
        liq = 8.5
    elif tvl < 5e7:
        liq = 6.0
    elif tvl < 2e8:
        liq = 4.2
    elif tvl < 1e9:
        liq = 2.8
    if ch7 <= -20:
        liq += 2.5
    elif ch7 <= -10:
        liq += 1.2
    layers["liquidity"] = _clamp(liq)

    apy = _apy_frac(ctx.get("apy")) or 0
    apy_base = _apy_frac(ctx.get("apyBase"))
    apy_reward = _apy_frac(ctx.get("apyReward")) or 0
    mean30 = _apy_frac(ctx.get("apyMean30d"))
    y = 2.0
    if apy_base is not None and apy > 0 and apy_reward / max(apy, 1e-9) > 0.7:
        y = 7.2
    if ctx.get("outlier"):
        y = max(y, 8.0)
    sigma = _as_float(ctx.get("sigma")) or 0
    if sigma > 0.4:
        y += 2.0
    if mean30 is not None and apy > 0 and apy > mean30 * 2.5:
        y += 1.8
    layers["yield"] = _clamp(y)

    il = 1.5
    if (ctx.get("ilRisk") or "").lower() == "yes":
        il = 7.0
    if (ctx.get("exposure") or "").lower() == "multi":
        il = max(il, 5.5)
    layers["il"] = _clamp(il)

    layers["chain"] = _clamp(_chain_risk(ctx.get("chain")))

    br = 1.5
    if ctx.get("extraHop"):
        br = 6.5
    if kind in {"yield_wrap"}:
        br = max(br, 5.0)
    if ctx.get("bridgeHack"):
        br += 2.0
    layers["bridge"] = _clamp(br)

    layers["admin"] = _clamp(_kind_admin_risk(kind) + (1.5 if audits <= 0 else 0))

    hack = ctx.get("hack") or {}
    hk = 1.0
    if hack:
        amt = _as_float(hack.get("amount")) or 0
        hk = 5.0
        if amt >= 50:
            hk = 7.5
        if amt >= 200:
            hk = 9.0
        ts = _as_float(hack.get("date")) or 0
        if ts and (time.time() - ts) < 365 * 86400:
            hk += 1.0
    layers["hack"] = _clamp(hk)

    total = 0.0
    weighted = {}
    for key, weight in RISK_WEIGHTS.items():
        mark = layers.get(key, 5.0)
        weighted[key] = round(mark, 2)
        total += mark * weight
    total = round(total / 10.0, 1)  # 0–100
    if total < 28:
        grade = "A"
    elif total < 38:
        grade = "B+"
    elif total < 48:
        grade = "B"
    elif total < 58:
        grade = "C+"
    elif total < 70:
        grade = "C"
    else:
        grade = "D"
    return {
        "score": total,
        "grade": grade,
        "layers": weighted,
        "hack": hack or None,
    }


def _protocol_row(protocol, *, wrap=None, hacks=None, extra=None):
    chains = protocol.get("chains") or []
    chain_label = ", ".join(chains[:3]) if chains else "—"
    if len(chains) > 3:
        chain_label += f" +{len(chains) - 3}"
    wrap = wrap or {}
    oracles = protocol.get("oracles") or []
    if isinstance(oracles, str):
        oracles = [oracles]
    hack = _hack_for_name(hacks, protocol.get("name"))
    row = {
        "name": protocol.get("name"),
        "slug": protocol.get("slug"),
        "symbol": protocol.get("symbol") or wrap.get("peg"),
        "category": protocol.get("category"),
        "tvl": _as_float(protocol.get("tvl")),
        "change1d": _as_float(protocol.get("change_1d")),
        "change7d": _as_float(protocol.get("change_7d")),
        "change1m": _as_float(protocol.get("change_1m")),
        "chains": chain_label,
        "chain": (chains[0] if chains else None),
        "audits": _audit_score(protocol),
        "oracles": oracles,
        "listedAt": protocol.get("listedAt"),
        "ageDays": _age_days(protocol.get("listedAt")),
        "mcap": _as_float(protocol.get("mcap")),
        "url": protocol.get("url"),
        "kind": wrap.get("kind"),
        "issuer": wrap.get("issuer"),
        "path": wrap.get("path"),
        "peg": wrap.get("peg"),
        "hack": hack,
    }
    if extra:
        row.update(extra)
    row["risk"] = score_risk(
        {
            "pegBps": row.get("pegBps"),
            "kind": row.get("kind") or "movement",
            "audits": row.get("audits"),
            "ageDays": row.get("ageDays"),
            "oracles": row.get("oracles"),
            "needsOracle": row.get("kind") in {"lending", "yield_wrap"},
            "tvl": row.get("tvl"),
            "change7d": row.get("change7d"),
            "chain": row.get("chain"),
            "extraHop": row.get("kind") == "yield_wrap",
            "bridgeHack": bool((hack or {}).get("bridgeHack")),
            "hack": hack,
            "ilRisk": row.get("ilRisk"),
            "exposure": row.get("exposure"),
            "apy": row.get("apy"),
            "apyBase": row.get("apyBase"),
            "apyReward": row.get("apyReward"),
            "apyMean30d": row.get("apyMean30d"),
            "sigma": row.get("sigma"),
            "outlier": row.get("outlier"),
        }
    )
    return row


def _protocols_for_slugs(slugs):
    store = get_defillama_protocols()
    rows = []
    for slug in slugs:
        protocol = store["by_slug"].get(slug)
        if protocol:
            rows.append(protocol)
    return rows


def _heroes_from_rows(rows, value_key="tvl", extra_sub=None):
    heroes = []
    for row in rows[:4]:
        risk = row.get("risk") or {}
        sub = extra_sub(row) if extra_sub else (row.get("issuer") or row.get("category") or row.get("chains") or "")
        if risk.get("grade"):
            sub = f"{sub} · risk {risk.get('grade')}" if sub else f"risk {risk.get('grade')}"
        heroes.append(
            {
                "name": row.get("name"),
                "value": row.get(value_key),
                "changePct": row.get("change1d") if row.get("change1d") is not None else row.get("change7d"),
                "sub": sub,
            }
        )
    return heroes


def _risk_kpis(rows, *, peg_bps=None):
    scores = [r["risk"]["score"] for r in rows if r.get("risk")]
    if not scores:
        return []
    worst = max(rows, key=lambda r: (r.get("risk") or {}).get("score") or 0)
    hacks = sum(1 for r in rows if r.get("hack") or (r.get("risk") or {}).get("hack"))
    median = sorted(scores)[len(scores) // 2]
    kpis = [
        {
            "name": "Median risk",
            "value": median,
            "sub": "0–100 fragility (higher = worse)",
            "kind": "risk",
        },
        {
            "name": "Weakest name",
            "value": (worst.get("risk") or {}).get("score"),
            "sub": f"{worst.get('name')} · {(worst.get('risk') or {}).get('grade')}",
            "kind": "risk",
        },
        {
            "name": "Hack flags",
            "value": hacks,
            "sub": "Llama historical match on name",
            "kind": "count",
        },
    ]
    if peg_bps is not None:
        kpis.insert(
            2,
            {
                "name": "Peg stress",
                "value": peg_bps,
                "sub": "abs(wrapper − spot) in bps",
                "kind": "bps",
            },
        )
    return kpis[:4]


def _protocol_tvl_chart(slug):
    try:
        data = _fetch_json(f"{DEFILLAMA_API}/protocol/{slug}")
    except Exception:
        return []
    points = []
    for row in data.get("tvl") or []:
        ts = row.get("date")
        val = row.get("totalLiquidityUSD")
        if ts is None or val is None:
            continue
        points.append(
            {
                "date": time.strftime("%Y-%m-%d", time.gmtime(int(ts))),
                "close": _as_float(val),
            }
        )
    return _downsample_points(points)


def _yield_chart(pool_id, project=None, symbol=None):
    if not pool_id:
        return []
    try:
        data = _fetch_json(f"{YIELDS_API}/chart/{pool_id}")
    except Exception:
        return []
    rows = data.get("data") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        return []
    points = []
    for row in rows:
        ts = row.get("timestamp") or row.get("date")
        val = row.get("apy")
        if val is None:
            val = row.get("tvlUsd")
        if ts is None or val is None:
            continue
        if isinstance(ts, (int, float)):
            date = time.strftime("%Y-%m-%d", time.gmtime(int(ts)))
        else:
            date = str(ts)[:10]
        close = (
            _apy_frac(val, project, symbol)
            if row.get("apy") is not None
            else _as_float(val)
        )
        points.append({"date": date, "close": close})
    return _downsample_points(points)


def _fetch_wrapped_btc_prices():
    ids = ",".join(WRAPPED_BTC_PRICES.values())
    data = _fetch_json(f"{COINS_API}/prices/current/{ids}")
    coins = data.get("coins") or {}
    rows = []
    spot = None
    by_peg = {}
    for label, coin_id in WRAPPED_BTC_PRICES.items():
        quote = coins.get(coin_id) or {}
        px = _as_float(quote.get("price"))
        if label == "BTC":
            spot = px
        row = {
            "name": label,
            "symbol": quote.get("symbol") or label,
            "price": px,
            "confidence": quote.get("confidence"),
        }
        rows.append(row)
        by_peg[label] = row
    if spot:
        for row in rows:
            if row["name"] == "BTC" or not row.get("price"):
                continue
            row["pegBps"] = ((row["price"] - spot) / spot) * 10000
    return rows, spot, by_peg


def _stable_usd_value(value):
    if value is None:
        return None
    if isinstance(value, dict):
        return _as_float(value.get("peggedUSD"))
    return _as_float(value)


def _stable_circulating(asset):
    return _stable_usd_value(asset.get("circulating"))


def get_all_yield_pools():
    key = "defillama:yields-all"
    cached = _cget(key, _ttl())
    if cached is not None:
        return cached
    data = _fetch_json(f"{YIELDS_API}/pools")
    pools = data.get("data") or []
    if not isinstance(pools, list):
        pools = []
    _cset(key, pools, _ttl())
    return pools


def _btc_yield_pools():
    return [p for p in get_all_yield_pools() if _pool_has_btc(p)]


def _pool_has_btc(pool):
    symbol = (pool.get("symbol") or "").upper().replace(" ", "")
    blob = " ".join(
        [
            str(pool.get("symbol") or ""),
            str(pool.get("project") or ""),
            str(pool.get("poolMeta") or ""),
            " ".join(pool.get("underlyingTokens") or []),
        ]
    ).lower()
    if any(t in symbol for t in BTC_WRAP_TICKERS):
        return True
    return any(t.lower() in blob for t in ("wbtc", "cbbtc", "tbtc", "lbtc", "sbtc", "solvbtc"))


def _pool_row(pool, hacks=None, *, kind="lending"):
    project = pool.get("project")
    hack = _hack_for_name(hacks, project)
    extra_hop = (pool.get("chain") or "").lower() not in (L1_CHAINS | {"ethereum"})
    row = {
        "name": project,
        "symbol": pool.get("symbol"),
        "tvl": _as_float(pool.get("tvlUsd")),
        "apy": _apy_frac(pool.get("apy"), project, pool.get("symbol")),
        "apyBase": _apy_frac(pool.get("apyBase"), project, pool.get("symbol")),
        "apyReward": _apy_frac(pool.get("apyReward"), project, pool.get("symbol")),
        "apyMean30d": _apy_frac(pool.get("apyMean30d"), project, pool.get("symbol")),
        "change7d": _as_float(pool.get("apyPct7D")),
        "chain": pool.get("chain"),
        "chains": pool.get("chain") or "—",
        "ilRisk": pool.get("ilRisk"),
        "exposure": pool.get("exposure"),
        "sigma": _as_float(pool.get("sigma")),
        "outlier": bool(pool.get("outlier")),
        "volume24h": _as_float(pool.get("volumeUsd1d")),
        "volume7d": _as_float(pool.get("volumeUsd7d")),
        "pool": pool.get("pool"),
        "poolMeta": pool.get("poolMeta"),
        "predictions": pool.get("predictions"),
        "kind": kind,
        "hack": hack,
        "audits": None,
        "borrowable": False,
        "apyBorrow": None,
        "apyBorrowReward": None,
        "ltv": None,
        "totalBorrow": None,
        "totalSupply": None,
        "util": None,
    }
    lb = get_lend_borrow().get(pool.get("pool")) or {}
    if lb:
        supply = _as_float(lb.get("totalSupplyUsd"))
        borrowed = _as_float(lb.get("totalBorrowUsd"))
        row["borrowable"] = bool(lb.get("borrowable"))
        row["apyBorrow"] = _borrow_apy_frac(lb.get("apyBaseBorrow"))
        row["apyBorrowReward"] = _borrow_apy_frac(lb.get("apyRewardBorrow"))
        row["ltv"] = _as_float(lb.get("ltv"))
        row["totalBorrow"] = borrowed
        row["totalSupply"] = supply
        if supply and supply > 0 and borrowed is not None:
            row["util"] = borrowed / supply
    proto = get_defillama_protocols()["by_slug"].get(project) or get_defillama_protocols()["by_slug"].get(
        str(project or "").replace(" ", "-")
    )
    if proto:
        row["audits"] = _audit_score(proto)
        row["oracles"] = proto.get("oracles") or []
        row["ageDays"] = _age_days(proto.get("listedAt"))
        row["category"] = proto.get("category")
    row["risk"] = score_risk(
        {
            "kind": kind,
            "audits": row.get("audits") or 0,
            "ageDays": row.get("ageDays"),
            "oracles": row.get("oracles"),
            "needsOracle": kind == "lending",
            "tvl": row.get("tvl"),
            "change7d": None,
            "chain": row.get("chain"),
            "extraHop": extra_hop and kind != "lending",
            "hack": hack,
            "ilRisk": row.get("ilRisk"),
            "exposure": row.get("exposure"),
            "apy": row.get("apy"),
            "apyBase": row.get("apyBase"),
            "apyReward": row.get("apyReward"),
            "apyMean30d": row.get("apyMean30d"),
            "sigma": row.get("sigma"),
            "outlier": row.get("outlier"),
        }
    )
    row["apyView"] = _apy_view({**row, "project": project})
    return row


def _payload_base(section, title, source):
    return {
        "section": section,
        "title": title,
        "source": source,
        "fetchedAt": _now_iso(),
        "disclaimer": DISCLAIMER,
        "intro": PAGE_INTROS.get(section),
    }


def fetch_defi_wrapped():
    hacks = get_defillama_hacks()
    prices, spot, by_peg = _fetch_wrapped_btc_prices()
    store = get_defillama_protocols()
    rows = []
    for slug in WRAPPED_BTC_SLUGS:
        proto = store["by_slug"].get(slug)
        if not proto:
            continue
        meta = WRAP_META.get(slug) or {}
        peg = meta.get("peg")
        extra = {
            "kind": meta.get("kind"),
            "issuer": meta.get("issuer"),
            "path": meta.get("path"),
            "peg": peg,
        }
        if peg and by_peg.get(peg) and by_peg[peg].get("pegBps") is not None:
            extra["pegBps"] = by_peg[peg]["pegBps"]
            extra["price"] = by_peg[peg].get("price")
        row = _protocol_row(proto, wrap=meta, hacks=hacks, extra=extra)
        rows.append(row)
    rows.sort(key=lambda r: r.get("tvl") or 0, reverse=True)
    total_tvl = sum(r.get("tvl") or 0 for r in rows)
    pegs = [abs(r["pegBps"]) for r in rows if r.get("pegBps") is not None]
    max_peg = max(pegs) if pegs else None
    chart = _protocol_tvl_chart("wbtc")
    heroes = [
        {
            "name": "Total wrapped TVL",
            "value": total_tvl,
            "changePct": None,
            "sub": f"{len(rows)} representations (custodial / threshold / L2 / yield)",
        }
    ]
    heroes.extend(_heroes_from_rows(rows)[:3])
    out = _payload_base("wrapped", "Wrapped BTC", "DeFi Llama · coins.llama.fi")
    out.update(
        {
            "heroes": heroes[:4],
            "riskKpis": _risk_kpis(rows, peg_bps=max_peg),
            "table": rows,
            "prices": prices,
            "spot": spot,
            "chart": {"points": chart, "label": "WBTC TVL (USD)"},
            "chartLabel": "WBTC TVL (USD)",
            "tableMode": "wrapped",
        }
    )
    return out


def fetch_defi_stables():
    data = _fetch_json(f"{STABLECOINS_API}/stablecoins?includePrices=true")
    assets = data.get("peggedAssets") or []
    usd_assets = [a for a in assets if (a.get("pegType") or "").upper() == "PEGGEDUSD"]
    usd_assets.sort(key=_stable_circulating, reverse=True)
    total_mcap = sum(_stable_circulating(a) or 0 for a in usd_assets)
    table = []
    for asset in usd_assets[:15]:
        mcap = _stable_circulating(asset) or 0
        prev_week = _stable_usd_value(asset.get("circulatingPrevWeek"))
        change7d = None
        if prev_week and prev_week > 0:
            change7d = ((mcap - prev_week) / prev_week) * 100
        price = _stable_usd_value(asset.get("price"))
        peg_bps = ((price - 1) * 10000) if price else None
        row = {
            "name": asset.get("name"),
            "symbol": asset.get("symbol"),
            "mcap": mcap,
            "price": price,
            "pegBps": peg_bps,
            "change7d": change7d,
            "chains": len(asset.get("chains") or []),
            "kind": "custodial" if (asset.get("symbol") or "") in {"USDT", "USDC"} else "stable",
        }
        row["risk"] = score_risk(
            {
                "pegBps": abs(peg_bps or 0),
                "kind": "custodial" if abs(peg_bps or 0) < 30 else "yield_wrap",
                "audits": 2,
                "tvl": mcap,
                "chain": "ethereum",
            }
        )
        table.append(row)

    heroes = [
        {
            "name": "Total Stablecoin MCap",
            "value": total_mcap,
            "changePct": None,
            "sub": f"{len(usd_assets)} USD-pegged assets",
        }
    ]
    for asset in usd_assets[:3]:
        mcap = _stable_circulating(asset) or 0
        share = (mcap / total_mcap * 100) if total_mcap else None
        heroes.append(
            {
                "name": asset.get("symbol") or asset.get("name"),
                "value": mcap,
                "changePct": share,
                "sub": f"{asset.get('name')} · {share:.1f}% share" if share is not None else asset.get("name"),
            }
        )

    history = _fetch_json(f"{STABLECOINS_API}/stablecoincharts/all")
    mcap_points = []
    for row in history or []:
        ts = row.get("date")
        circ = row.get("totalCirculatingUSD") or row.get("totalCirculating") or {}
        val = _as_float(circ.get("peggedUSD") if isinstance(circ, dict) else circ)
        if ts is None or val is None:
            continue
        mcap_points.append(
            {
                "date": time.strftime("%Y-%m-%d", time.gmtime(int(ts))),
                "close": val,
            }
        )
    dominance = []
    for asset in usd_assets[:8]:
        mcap = _stable_circulating(asset) or 0
        if not total_mcap:
            continue
        dominance.append(
            {
                "name": asset.get("symbol") or asset.get("name"),
                "share": (mcap / total_mcap) * 100,
                "mcap": mcap,
            }
        )
    stressed = [t for t in table if t.get("pegBps") is not None and abs(t["pegBps"]) >= 50]
    out = _payload_base("stables", "Stablecoins", "DeFi Llama Stablecoins")
    out.update(
        {
            "heroes": heroes[:4],
            "riskKpis": _risk_kpis(table, peg_bps=max((abs(t.get("pegBps") or 0) for t in table), default=None)),
            "table": table,
            "chart": {"points": _downsample_points(mcap_points), "label": "Total Stablecoin Market Cap"},
            "chartLabel": "Total Stablecoin Market Cap",
            "chart2": {"items": dominance, "label": "Dominance (Top 8)"},
            "chart2Label": "Dominance (Top 8)",
            "tableMode": "stables",
            "pegAlerts": len(stressed),
        }
    )
    return out


def fetch_defi_bridges():
    """Cross-chain movement venues — wrap issuers are excluded."""
    hacks = get_defillama_hacks()
    store = get_defillama_protocols()
    seen = set()
    protos = []
    for slug in BRIDGE_MOVEMENT_SLUGS:
        p = store["by_slug"].get(slug)
        if p and slug not in WRAP_SLUG_SET:
            protos.append(p)
            seen.add(slug)
    for p in store["list"]:
        slug = p.get("slug")
        if not slug or slug in seen or slug in WRAP_SLUG_SET:
            continue
        cat = p.get("category") or ""
        name = (p.get("name") or "").lower()
        # Generic Llama "Bridge" is mostly wrap issuers / CEX pegs — keep those
        # off this page. Movement slugs are added above.
        if cat != "Cross Chain Bridge":
            continue
        if any(h in name for h in ("wbtc", "cbbtc", "wrapped bitcoin", "binance bitcoin")):
            continue
        if (p.get("tvl") or 0) < 1e6:
            continue
        protos.append(p)
        seen.add(slug)
        if len(protos) >= 18:
            break
    rows = []
    for p in protos:
        name = (p.get("name") or "").lower()
        kind = "movement"
        flavor = "WBTC/asset router"
        if any(h in name for h in BTC_NATIVE_BRIDGE_HINTS):
            flavor = "Native BTC path"
        row = _protocol_row(
            p,
            wrap={"kind": kind, "issuer": flavor, "path": "Lock/mint or liquidity network"},
            hacks=hacks,
            extra={"bridgeFlavor": flavor},
        )
        rows.append(row)
    rows.sort(key=lambda r: r.get("tvl") or 0, reverse=True)
    rows = rows[:15]
    total = sum(r.get("tvl") or 0 for r in rows)
    chart_slug = rows[0]["slug"] if rows else "across"
    chart = _protocol_tvl_chart(chart_slug) if rows else []
    heroes = [
        {
            "name": "Bridge TVL (movement)",
            "value": total,
            "changePct": None,
            "sub": f"{len(rows)} routers · wrap issuers live on Wrapped BTC",
        }
    ]
    heroes.extend(_heroes_from_rows(rows, extra_sub=lambda r: r.get("bridgeFlavor") or r.get("category"))[:3])
    out = _payload_base("bridges", "BTC Bridges", "DeFi Llama protocols (movement venues)")
    out.update(
        {
            "heroes": heroes[:4],
            "riskKpis": _risk_kpis(rows),
            "table": rows,
            "chart": {
                "points": chart,
                "label": f"{rows[0]['name']} TVL" if rows else "Bridge TVL",
            },
            "chartLabel": f"{rows[0]['name']} TVL" if rows else "Bridge TVL",
            "tableMode": "bridges",
        }
    )
    return out


def _lending_pools(pools):
    out = []
    for p in pools:
        symbol = (p.get("symbol") or "").upper().replace(" ", "")
        if (p.get("exposure") or "").lower() == "multi":
            continue
        if not _symbol_has_token(p.get("symbol"), BTC_WRAP_TICKERS):
            continue
        if "/" in (p.get("symbol") or ""):
            continue
        tvl = p.get("tvlUsd") or 0
        if tvl < 2e6:
            continue
        proj = (p.get("project") or "").lower()
        if _looks_restake(proj, p.get("symbol")):
            continue
        money = any(
            k in proj
            for k in ("aave", "compound", "spark", "morpho", "fluid-lending", "sky", "crvusd", "benqi")
        )
        if not money and p.get("pool") not in get_lend_borrow():
            continue
        apy = _apy_frac(p.get("apy"), p.get("project"), p.get("symbol")) or 0
        if apy < 0.0005 and not any(k in proj for k in ("aave", "compound", "morpho", "spark")):
            continue
        out.append(p)
    out.sort(key=lambda p: p.get("tvlUsd") or 0, reverse=True)
    return out


def _lp_pools(pools):
    out = []
    for p in pools:
        symbol = (p.get("symbol") or "").upper()
        il = (p.get("ilRisk") or "").lower() == "yes"
        multi = (p.get("exposure") or "").lower() == "multi"
        if not (il or multi or "/" in symbol):
            continue
        if not _pool_has_btc(p):
            continue
        if (p.get("tvlUsd") or 0) < 5e5:
            continue
        out.append(p)
    out.sort(key=lambda p: p.get("volumeUsd1d") or p.get("tvlUsd") or 0, reverse=True)
    return out


def fetch_defi_lending():
    hacks = get_defillama_hacks()
    pools = _lending_pools(_btc_yield_pools())
    table = [_pool_row(p, hacks, kind="lending") for p in pools[:15]]
    total = sum(r.get("tvl") or 0 for r in table)
    heroes = [
        {
            "name": "BTC lending TVL",
            "value": total,
            "changePct": None,
            "sub": f"{len(pools)} single-asset WBTC/cbBTC/tBTC/LBTC pools",
        }
    ]
    for row in table[:3]:
        apy = row.get("apy")
        heroes.append(
            {
                "name": f"{row.get('name')} {row.get('symbol')}",
                "value": row.get("tvl"),
                "changePct": None,
                "sub": f"{row.get('chain')} · APY {((row.get('apyView') or {}).get('cash') if (row.get('apyView') or {}).get('inflated') else apy or 0) * 100:.2f}% · risk {(row.get('risk') or {}).get('grade')}",
            }
        )
    chart = (
        _yield_chart(table[0]["pool"], table[0].get("name"), table[0].get("symbol"))
        if table
        else []
    )
    out = _payload_base("lending", "BTC Lending", "DeFi Llama Yields")
    out.update(
        {
            "heroes": heroes[:4],
            "riskKpis": _risk_kpis(table),
            "table": table,
            "chart": {
                "points": chart,
                "label": f"{table[0]['name']} {table[0]['symbol']} APY" if table else "APY",
            },
            "chartLabel": (
                f"{table[0]['name']} {table[0]['symbol']} APY history" if table else "Lending APY"
            ),
            "tableMode": "lending",
        }
    )
    return out


def fetch_defi_borrowing():
    hacks = get_defillama_hacks()
    pools = _lending_pools(_btc_yield_pools())
    table = []
    for p in pools:
        row = _pool_row(p, hacks, kind="lending")
        if not row.get("borrowable") and row.get("apyBorrow") is None:
            continue
        if not row.get("totalBorrow") and not row.get("apyBorrow"):
            continue
        table.append(row)
    table.sort(key=lambda r: r.get("totalBorrow") or 0, reverse=True)
    table = table[:15]
    borrowed = sum(r.get("totalBorrow") or 0 for r in table)
    cheapest = None
    for r in table:
        if r.get("apyBorrow") is None:
            continue
        if cheapest is None or r["apyBorrow"] < cheapest["apyBorrow"]:
            cheapest = r
    heroes = [
        {
            "name": "BTC borrowed",
            "value": borrowed,
            "changePct": None,
            "sub": f"{len(table)} markets · Llama lend/borrow",
        }
    ]
    if cheapest:
        heroes.append(
            {
                "name": f"Cheapest {cheapest.get('symbol')}",
                "value": cheapest.get("apyBorrow"),
                "sub": f"{cheapest.get('name')} {cheapest.get('chain')} · borrow APY",
                "kind": "apy",
            }
        )
    if table:
        top = table[0]
        heroes.append(
            {
                "name": f"{top.get('name')} {top.get('symbol')}",
                "value": top.get("totalBorrow"),
                "sub": f"{top.get('chain')} · util {((top.get('util') or 0) * 100):.0f}% · LTV {((top.get('ltv') or 0) * 100):.0f}%",
            }
        )
        ltvs = [r.get("ltv") for r in table if r.get("ltv")]
        if ltvs:
            heroes.append(
                {
                    "name": "Median LTV",
                    "value": sorted(ltvs)[len(ltvs) // 2],
                    "sub": "Max loan-to-value (stay well below)",
                    "kind": "ltv",
                }
            )
    out = _payload_base("borrowing", "BTC Borrowing", "DeFi Llama lend/borrow")
    out.update(
        {
            "heroes": heroes[:4],
            "riskKpis": _risk_kpis(table),
            "table": table,
            "chart": {"points": [], "label": "Borrow APY"},
            "chartLabel": "Borrow APY",
            "tableMode": "borrowing",
        }
    )
    return out


def fetch_defi_liquidity():
    hacks = get_defillama_hacks()
    pools = _lp_pools(_btc_yield_pools())
    table = [_pool_row(p, hacks, kind="dex") for p in pools[:15]]
    total_vol = sum(r.get("volume24h") or 0 for r in table)
    heroes = [
        {
            "name": "BTC pool volume (24h)",
            "value": total_vol,
            "changePct": None,
            "sub": "WBTC/cbBTC/tBTC pairs — not global DEX volume",
        }
    ]
    for row in table[:3]:
        heroes.append(
            {
                "name": f"{row.get('name')} {row.get('symbol')}",
                "value": row.get("volume24h") or row.get("tvl"),
                "changePct": None,
                "sub": f"{row.get('chain')} · IL {(row.get('ilRisk') or '—')} · risk {(row.get('risk') or {}).get('grade')}",
            }
        )
    chart = _yield_chart(table[0]["pool"]) if table else []
    out = _payload_base("liquidity", "BTC DEX Liquidity", "DeFi Llama Yields (BTC pairs)")
    out.update(
        {
            "heroes": heroes[:4],
            "riskKpis": _risk_kpis(table),
            "table": table,
            "chart": {
                "points": chart,
                "label": f"{table[0]['name']} {table[0]['symbol']} APY" if table else "LP APY",
            },
            "chartLabel": (
                f"{table[0]['name']} {table[0]['symbol']} APY history" if table else "LP APY"
            ),
            "tableMode": "liquidity",
        }
    )
    return out


def fetch_defi_staking():
    hacks = get_defillama_hacks()
    store = get_defillama_protocols()
    seen = set()
    protos = []
    for slug in STAKING_BTC_SLUGS:
        p = store["by_slug"].get(slug)
        if p:
            protos.append(p)
            seen.add(slug)
    for p in store["list"]:
        slug = p.get("slug")
        if slug in seen:
            continue
        cat = p.get("category") or ""
        name = (p.get("name") or "").lower()
        if cat in {"Restaked BTC", "Anchor BTC"} or (
            "btc" in name and cat in {"Liquid Staking", "Restaking"}
        ):
            protos.append(p)
            seen.add(slug)
    proto_rows = []
    for p in protos:
        meta = WRAP_META.get(p.get("slug")) or {
            "kind": "staking",
            "issuer": p.get("category"),
            "path": "Restaked / liquid BTC — not native yield on L1 Bitcoin",
        }
        proto_rows.append(
            _protocol_row(
                p,
                wrap={**meta, "kind": "staking"},
                hacks=hacks,
            )
        )
    proto_rows.sort(key=lambda r: r.get("tvl") or 0, reverse=True)
    proto_rows = proto_rows[:12]

    pools = _btc_yield_pools()
    stake_pools = []
    for p in pools:
        proj = (p.get("project") or "").lower()
        if any(k in proj for k in ("babylon", "lombard", "solv", "bedrock", "lorenzo", "ether.fi")):
            if (p.get("tvlUsd") or 0) >= 1e6:
                stake_pools.append(p)
    stake_pools.sort(key=lambda p: p.get("tvlUsd") or 0, reverse=True)
    pool_rows = [_pool_row(p, hacks, kind="staking") for p in stake_pools[:10]]

    total = sum(r.get("tvl") or 0 for r in proto_rows)
    heroes = [
        {
            "name": "BTC staking TVL",
            "value": total,
            "changePct": None,
            "sub": "Restaking · liquid staking — wrapped stack, not native BTC yield",
        }
    ]
    heroes.extend(_heroes_from_rows(proto_rows)[:3])
    chart_slug = proto_rows[0]["slug"] if proto_rows else "babylon-protocol"
    chart = _protocol_tvl_chart(chart_slug) if proto_rows else []
    out = _payload_base("staking", "BTC Staking", "DeFi Llama · Yields")
    out.update(
        {
            "heroes": heroes[:4],
            "riskKpis": _risk_kpis(proto_rows + pool_rows),
            "table": proto_rows,
            "pools": pool_rows,
            "chart": {
                "points": chart,
                "label": f"{proto_rows[0]['name']} TVL" if proto_rows else "Staking TVL",
            },
            "chartLabel": f"{proto_rows[0]['name']} TVL" if proto_rows else "Staking TVL",
            "tableMode": "staking",
            "poolsMode": "stakingPools",
        }
    )
    return out


def _symbol_tokens(symbol):
    raw = (symbol or "").upper()
    parts = []
    buf = ""
    for ch in raw:
        if ch.isalnum() or ch == ".":
            buf += ch
        else:
            if buf:
                parts.append(buf)
                buf = ""
    if buf:
        parts.append(buf)
    return parts


def _symbol_has_token(symbol, tokens):
    parts = set(_symbol_tokens(symbol))
    return any(t.upper() in parts for t in tokens)


def _best_pool(pools, *, project_has, symbol_has=None, chain=None, chains=None, min_apy=None):
    cands = []
    for p in pools:
        proj = (p.get("project") or "").lower()
        if not any(k in proj for k in project_has):
            continue
        if symbol_has and not _symbol_has_token(p.get("symbol"), symbol_has):
            continue
        ch = (p.get("chain") or "")
        if chain and ch.lower() != chain.lower():
            continue
        if chains and ch not in chains:
            continue
        apy = _apy_frac(p.get("apy"), p.get("project")) or 0
        if min_apy is not None and apy < min_apy:
            continue
        cands.append(p)
    cands.sort(key=lambda p: p.get("tvlUsd") or 0, reverse=True)
    return cands[0] if cands else None


def _ticket_score(risk_score, apy, *, defined=True, core=True, paper=False, il=False):
    attract = 50
    process = 55
    cash = min(max(apy or 0, 0), 0.04 if not il else 0.06)
    if cash:
        attract += min(16, cash * 500)
    if il:
        process -= 10
        attract -= 4
    if defined:
        process += 12
    else:
        process -= 14
    process -= min(35, (risk_score or 50) * 0.45)
    if core:
        process += 8
    else:
        attract += 8
        process -= 6
    if paper:
        attract -= 18
        process -= 12
    attract = max(8, min(96, round(attract)))
    process = max(8, min(96, round(process)))
    composite = round(0.45 * attract + 0.55 * process)
    if composite >= 78:
        grade = "A"
    elif composite >= 68:
        grade = "B+"
    elif composite >= 58:
        grade = "B"
    elif composite >= 48:
        grade = "C+"
    elif composite >= 38:
        grade = "C"
    else:
        grade = "D"
    return {"attract": attract, "process": process, "composite": composite, "grade": grade}


def _pair_kind(symbol):
    toks = _symbol_tokens(symbol)
    btcish = [t for t in toks if t in BTC_WRAP_TICKERS or t in {"BTC", "BTCB", "WBTC"}]
    stables = [t for t in toks if t in {"USDC", "USDT", "DAI", "CRVUSD", "USD", "USDE", "FRAX"}]
    eth = [t for t in toks if t in {"ETH", "WETH", "STETH", "WSTETH"}]
    if len(btcish) >= 2 and not stables and not eth:
        return "btc-btc"
    if btcish and stables:
        return "btc-stable"
    if btcish and eth:
        return "btc-eth"
    return "other"


_MM_PROJECTS = (
    "aave-v3",
    "aave-v4",
    "compound-v3",
    "sparklend",
    "morpho-blue",
    "fluid-lending",
    "sky-lending",
)
_STABLES = ("USDC", "USDT", "DAI", "USDS", "USDE")
_CORE_CHAINS = {"Ethereum", "Base", "Arbitrum"}


def _mm_name(proj):
    p = (proj or "").lower()
    return any(k in p for k in _MM_PROJECTS)


def _stable_sym(sym):
    s = (sym or "").upper().replace(" ", "").replace(".", "")
    if s in {"USDCE", "USDBC"}:
        return "USDC"
    return s if s in _STABLES else None


def _best_by_tvl(rows):
    out = {}
    for r in rows:
        k = (r["project"], r["chain"], r["symbol"])
        prev = out.get(k)
        if prev is None or (r.get("tvl") or 0) > (prev.get("tvl") or 0):
            out[k] = r
    return out


def _build_dollar_carries(hacks):
    """BTC wrap in, borrow a dollar coin, lend that dollar coin. Net = earn − pay."""
    pools = get_all_yield_pools()
    lb = get_lend_borrow()
    by_id = {p.get("pool"): p for p in pools}

    collaterals = []
    for p in pools:
        if not _mm_name(p.get("project")):
            continue
        if p.get("chain") not in _CORE_CHAINS:
            continue
        if not _symbol_has_token(p.get("symbol"), BTC_WRAP_TICKERS):
            continue
        b = lb.get(p.get("pool")) or {}
        if not b.get("borrowable") or not (b.get("ltv") or 0) > 0.4:
            continue
        if (b.get("totalSupplyUsd") or p.get("tvlUsd") or 0) < 40e6:
            continue
        wrap = (p.get("symbol") or "").upper()
        collaterals.append({"pool": p, "lb": b, "wrap": wrap})

    supplies = []
    borrows = []
    for p in pools:
        if not _mm_name(p.get("project")):
            continue
        if p.get("chain") not in _CORE_CHAINS:
            continue
        st = _stable_sym(p.get("symbol"))
        if not st:
            continue
        apy = _apy_frac(p.get("apy"), p.get("project"), st)
        supplies.append(
            {
                "project": p.get("project"),
                "chain": p.get("chain"),
                "symbol": st,
                "apy": apy,
                "tvl": p.get("tvlUsd"),
                "pool": p.get("pool"),
            }
        )
        b = lb.get(p.get("pool")) or {}
        pay = _borrow_apy_frac(b.get("apyBaseBorrow"))
        if pay is None:
            continue
        if not b.get("borrowable") and (b.get("totalBorrowUsd") or 0) <= 0:
            continue
        borrows.append(
            {
                "project": p.get("project"),
                "chain": p.get("chain"),
                "symbol": st,
                "apy": pay,
                "reward": _borrow_apy_frac(b.get("apyRewardBorrow")) or 0,
                "ltv": b.get("ltv"),
                "borrowed": b.get("totalBorrowUsd"),
                "tvl": b.get("totalSupplyUsd") or p.get("tvlUsd"),
                "pool": p.get("pool"),
            }
        )

    supply_map = _best_by_tvl(supplies)
    borrow_map = _best_by_tvl(borrows)

    ideas = []
    seen = set()
    for col in collaterals:
        p = col["pool"]
        venue = p.get("project")
        chain = p.get("chain")
        wrap = col["wrap"]
        col_ltv = col["lb"].get("ltv") or 0.73
        wrap_row = _pool_row(p, hacks, kind="lending")
        for stable in _STABLES:
            bk = (venue, chain, stable)
            br = borrow_map.get(bk)
            if not br:
                continue
            pay = br["apy"] or 0
            for (lv, lc, ls), sp in supply_map.items():
                if ls != stable or lc != chain:
                    continue
                earn = sp.get("apy") or 0
                net = earn - pay + (br.get("reward") or 0)
                cross = lv != venue
                key = (wrap, venue, chain, stable, lv)
                if key in seen:
                    continue
                seen.add(key)
                ideas.append(
                    {
                        "wrap": wrap,
                        "wrap_venue": venue,
                        "chain": chain,
                        "stable": stable,
                        "borrow_apy": pay,
                        "lend_venue": lv,
                        "lend_apy": earn,
                        "net": net,
                        "cross": cross,
                        "ltv": col_ltv,
                        "col_tvl": p.get("tvlUsd"),
                        "lend_tvl": sp.get("tvl"),
                        "wrap_row": wrap_row,
                        "col_pool": p,
                    }
                )
    ideas.sort(key=lambda x: -(x["net"] or 0))
    return ideas


def fetch_defi_strategies():
    hacks = get_defillama_hacks()
    wraps = fetch_defi_wrapped()
    pools = _btc_yield_pools()
    tickets = []

    def add(ticket):
        tickets.append(ticket)

    def from_pool(pool, **kwargs):
        row = _pool_row(pool, hacks, kind=kwargs.pop("kind", "lending"))
        view = row.get("apyView") or _apy_view({**row, "project": pool.get("project")})
        ticket = {
            "apy": view.get("headline"),
            "apyCash": view.get("cash"),
            "apyBase": row.get("apyBase"),
            "apyReward": row.get("apyReward"),
            "apyMean30d": row.get("apyMean30d"),
            "apyNote": view.get("note"),
            "apyInflated": view.get("inflated"),
            "tvl": row.get("tvl"),
            "chain": row.get("chain"),
            "venue": pool.get("project"),
            "risk": row["risk"],
            "pool": row,
            "paper": False,
        }
        ticket.update(kwargs)
        if "score" not in ticket:
            ticket["score"] = _ticket_score(
                row["risk"]["score"],
                view.get("cash") if view.get("inflated") else (view.get("headline") or 0),
                defined=ticket.get("defined", True),
                core=ticket.get("sophistication") == "Core",
                paper=ticket.get("paper", False),
                il=(row.get("ilRisk") or "").lower() == "yes",
            )
        ticket.pop("defined", None)
        return ticket

    priced = [p for p in (wraps.get("prices") or []) if p.get("name") != "BTC" and p.get("pegBps") is not None]

    # --- Yield: lend wrapped bitcoin ---
    aave_wbtc = _best_pool(pools, project_has=("aave-v3",), symbol_has=("WBTC",), chain="Ethereum")
    if aave_wbtc:
        add(from_pool(
            aave_wbtc,
            kind="lending",
            id="aave-wbtc-supply",
            title="Lend WBTC on Aave (keep bitcoin exposure)",
            family="Lending",
            sophistication="Core",
            intent="Deposit wrapped bitcoin on Aave. Other people borrow it and pay you a small interest rate. You still move with bitcoin’s price. You are not looping and not putting two coins in a pool.",
            gate="WBTC’s price is close to bitcoin (within ~0.4%). Aave is operating normally. You do not borrow against the deposit.",
            exit="Withdraw if interest is almost all in a reward token, if a lot of money leaves Aave quickly, or if WBTC stops tracking bitcoin.",
            how=[
                "Wrap bitcoin to WBTC (BitGo path) if you do not already have it.",
                "On Ethereum, deposit WBTC into Aave v3 as a supply — not as a borrow.",
                "Do not click borrow. If you only supply, Aave cannot liquidate you.",
                "Interest shows up in the same token (WBTC).",
            ],
            assumptions=[
                "This is the simple yield ticket: one wrap + one money market.",
                "You keep bitcoin-price risk plus BitGo (WBTC) plus Aave.",
                "Typical cash yield is well under 2% per year — compare it to just holding bitcoin.",
            ],
            legs=[{"side": "SUPPLY", "asset": "WBTC", "venue": "Aave v3", "chain": "Ethereum", "note": "Deposit only — do not borrow"}],
            maxLoss="If Aave or WBTC’s issuer fails, the deposit can be impaired. You are not liquidated unless you also borrow.",
        ))

    aave_cb = _best_pool(pools, project_has=("aave-v3",), symbol_has=("CBBTC",))
    if aave_cb:
        add(from_pool(
            aave_cb,
            kind="lending",
            id="aave-cbbtc-supply",
            title=f"Lend cbBTC on Aave ({aave_cb.get('chain')})",
            family="Lending",
            sophistication="Core",
            intent="Same idea as lending WBTC, but the IOU is Coinbase’s cbBTC. Pick this only if you already trust Coinbase as the issuer and you are happy on this chain.",
            gate="cbBTC trades close to bitcoin. Coinbase is minting and redeeming as usual.",
            exit="Withdraw if Coinbase pauses mint/redeem, if cbBTC drifts from bitcoin, or if Aave looks stressed.",
            how=[
                "Get cbBTC (typically by sending bitcoin to Coinbase and withdrawing the wrap).",
                f"Deposit cbBTC into Aave v3 on {aave_cb.get('chain')}.",
                "Do not borrow against it on this ticket.",
            ],
            assumptions=[
                "Issuer risk is Coinbase instead of BitGo.",
                "Chain risk is whatever Aave listed (often Ethereum or Base).",
                "Still a small cash yield, not a farm.",
            ],
            legs=[{"side": "SUPPLY", "asset": "cbBTC", "venue": "Aave v3", "chain": aave_cb.get("chain")}],
            maxLoss="Coinbase wrap plus Aave. No liquidation if you do not borrow.",
        ))

    aave_tbtc = _best_pool(pools, project_has=("aave-v3",), symbol_has=("TBTC",), chain="Ethereum")
    if aave_tbtc:
        add(from_pool(
            aave_tbtc,
            kind="lending",
            id="aave-tbtc-supply",
            title="Lend tBTC on Aave (no single custodian)",
            family="Lending",
            sophistication="Core",
            intent="tBTC is wrapped bitcoin backed by a group of signers (Threshold), not one company like BitGo or Coinbase. You still deposit it on Aave for a small yield. Different IOU, same ‘lend and don’t borrow’ recipe.",
            gate="tBTC’s price is close to bitcoin. You are okay with a signer-set design instead of a named custodian.",
            exit="Withdraw if tBTC drifts ~0.8% from bitcoin or if Threshold has an incident.",
            how=[
                "Mint or buy tBTC (Threshold’s bitcoin wrap).",
                "Deposit tBTC on Aave v3 Ethereum.",
                "Do not borrow against it on this ticket.",
            ],
            assumptions=[
                "You swapped custodian risk for signer-set + contract risk.",
                "Cash yield is still small; the point is the wrap design, not a high APY.",
            ],
            legs=[{"side": "SUPPLY", "asset": "tBTC", "venue": "Aave v3", "chain": "Ethereum"}],
            maxLoss="Threshold or Aave failure. No liquidation if you do not borrow.",
        ))

    fluid = _best_pool(pools, project_has=("fluid-lending",), symbol_has=("WBTC",), chain="Ethereum")
    if fluid:
        add(from_pool(
            fluid,
            kind="lending",
            id="fluid-wbtc",
            title="Lend WBTC on Fluid (smaller than Aave)",
            family="Lending",
            sophistication="Advanced",
            intent="Fluid is another place to deposit WBTC for interest. It is smaller than Aave, so exits can be bumpier. Only use this after you are comfortable with the Aave version of the same idea.",
            gate="The pool has real size (we look for tens of millions). You have read how Fluid liquidates.",
            exit="Withdraw if lots of money leaves in a week or if interest looks fake (almost all reward tokens).",
            how=[
                "Same as Aave: wrap to WBTC, deposit, do not borrow — unless you open the Borrowing tab on purpose.",
                "Start with a slice of what you would put on Aave, not the whole stack.",
            ],
            assumptions=[
                "Extra risk vs Aave: smaller market, less battle-tested by your own history.",
                "Yield pick-up should be obvious after fees; if it is a few tenths of a percent, stay on Aave.",
            ],
            legs=[{"side": "SUPPLY", "asset": "WBTC", "venue": "Fluid", "chain": "Ethereum"}],
            maxLoss="Fluid plus WBTC issuer. Same liquidation rule: only if you borrow.",
        ))

    yearn = _best_pool(pools, project_has=("yearn",), symbol_has=("WBTC",), chain="Ethereum")
    if yearn:
        add(from_pool(
            yearn,
            kind="lending",
            id="yearn-wbtc",
            title="Put WBTC in a Yearn vault (they choose the route)",
            family="Lending",
            sophistication="Advanced",
            intent="You deposit WBTC into Yearn. Yearn’s strategy contract then lends or farms on your behalf. You are trusting Yearn’s code and the people who change the strategy — extra middlemen on top of WBTC.",
            gate="The vault is large enough to exit. You accept that Yearn can change how it uses your bitcoin-IOU.",
            exit="Leave if they switch into a strategy you did not agree to, or if the yield is mostly a new token.",
            how=[
                "Deposit WBTC into the Yearn WBTC vault on Ethereum.",
                "You receive a vault token that represents your share.",
                "Withdraw back to WBTC when you want out — check the strategy page first.",
            ],
            assumptions=[
                "Extra yield vs raw Aave supply is often small.",
                "You add Yearn strategy risk on purpose. If that is not clear, use Aave instead.",
            ],
            legs=[{"side": "DEPOSIT", "asset": "WBTC", "venue": "Yearn", "chain": "Ethereum"}],
            maxLoss="Vault bug or a strategy that loops without you noticing, plus WBTC issuer risk.",
        ))

    morpho = _best_pool(pools, project_has=("morpho",), symbol_has=("WBTC", "CBBTC"), chains=("Ethereum", "Base"))
    if morpho and (_apy_frac(morpho.get("apy"), morpho.get("project"), morpho.get("symbol")) or 0) > 0.0005:
        add(from_pool(
            morpho,
            kind="lending",
            id="morpho-isolated",
            title=f"Park {morpho.get('symbol')} on Morpho ({morpho.get('chain')}) — often 0% yield",
            family="Lending",
            sophistication="Advanced",
            intent="Morpho markets are one-collateral islands. Supply APY is often ~0% — you are parking the wrap so someone else can borrow, not earning a paycheck. Use this as a satellite, not as your main bitcoin stack.",
            gate="You have read that market’s max LTV and price feed. The market is large (we look for tens of millions).",
            exit="Leave if the oracle changes, if almost everyone borrows (utilization spikes), or if a reward token is the only yield.",
            how=[
                f"Deposit {morpho.get('symbol')} into the specific Morpho market — not a shared Aave-style pool.",
                "Expect little or no interest. The point is isolation (one market’s problems stay in that market).",
                "Do not borrow on this ticket unless you open a separate leverage idea.",
            ],
            assumptions=[
                "0% supply APY is normal here, not a bug.",
                "Thinner than Aave: harder to exit in a panic.",
            ],
            legs=[{"side": "SUPPLY", "asset": morpho.get("symbol"), "venue": morpho.get("project"), "chain": morpho.get("chain")}],
            maxLoss="That Morpho market plus the wrap. Other Morpho markets should not take this deposit down with them — that is the isolation bet.",
        ))

    def carry_ticket(c, *, paper=False):
        net = c["net"] or 0
        earn = c["lend_apy"] or 0
        pay = c["borrow_apy"] or 0
        wrap = c["wrap"]
        stable = c["stable"]
        ltv = c["ltv"] or 0.73
        use_ltv = min(0.30, max(0.15, ltv * 0.40))
        wr = c.get("wrap_row") or {}
        risk = dict(wr.get("risk") or {})
        extra = 8
        if c["cross"]:
            extra += 10
        if wrap in {"LBTC", "SOLVBTC"}:
            extra += 6
        risk["score"] = min(100, (risk.get("score") or 45) + extra)
        if risk["score"] >= 70:
            risk["grade"] = "D"
        elif risk["score"] >= 58:
            risk["grade"] = "C+"
        elif risk["score"] >= 48:
            risk["grade"] = "C"
        underwater = net < 0.001
        if underwater:
            paper = True
        soph = "Core" if (not c["cross"] and net >= 0.003) else ("Genius" if paper or c["cross"] else "Advanced")
        if c["cross"]:
            soph = "Advanced" if net >= 0.003 else "Genius"
        sign = f"{net * 100:+.1f}%"
        lend_name = c["lend_venue"]
        borrow_name = c["wrap_venue"]
        title = (
            f"Put {wrap} in, borrow {stable}, lend {stable} "
            f"({borrow_name} → {lend_name}) · net {sign}"
        )
        intent = (
            f"You deposit {wrap} (wrapped bitcoin) as collateral. You borrow {stable} (dollars) "
            f"and pay {pay * 100:.2f}% per year. You lend those same dollars on {lend_name} and earn "
            f"{earn * 100:.2f}%. Net cash yield is {sign} on the borrowed dollars — not on the whole bitcoin. "
            f"{'Two venues: extra contract risk.' if c['cross'] else 'Same venue: simpler, but the spread is often tiny or negative.'} "
            "You still have bitcoin-price risk. If bitcoin falls enough, the protocol sells your wrap."
        )
        if underwater:
            intent += (
                f" Today you would pay about {abs(net) * 100:.2f}% per year for this loop — it is not earning. "
                "We keep the recipe so you can see the math when the spread flips positive."
            )
        return {
            "id": f"carry-{wrap}-{stable}-{lend_name}",
            "title": title,
            "family": "Dollar carry",
            "sophistication": soph,
            "intent": intent,
            "gate": (
                f"{wrap} stays close to bitcoin. Health factor ≥ 2.0 at {use_ltv * 100:.0f}% LTV "
                f"(protocol cap ~{ltv * 100:.0f}%). Dollar coin stays near $1. "
                + ("Net earn − pay is positive after fees." if not underwater else "Only run live if net turns clearly positive.")
            ),
            "exit": (
                "Repay the dollar loan first if health factor < 1.6, if the wrap or the dollar coin drifts, "
                "or if borrow cost jumps above what you earn."
            ),
            "apy": net,
            "apyCash": max(net, 0) if not underwater else 0,
            "tvl": c.get("col_tvl"),
            "chain": c["chain"],
            "venue": f"{borrow_name} / {lend_name}",
            "how": [
                f"Wrap bitcoin to {wrap} if you need to.",
                f"Deposit {wrap} on {borrow_name} ({c['chain']}) as collateral. Do not use more than ~{use_ltv * 100:.0f}% LTV.",
                f"Borrow {stable}. You pay {pay * 100:.2f}% per year on that loan.",
                f"Deposit that {stable} on {lend_name} ({c['chain']}) to earn {earn * 100:.2f}%.",
                f"Net on the dollars: {sign}. The bitcoin stays posted as collateral.",
                "To exit: withdraw the dollars, repay the loan, then withdraw the wrap.",
            ],
            "assumptions": [
                f"Collateral: {wrap} on {borrow_name}. Max LTV ~{ltv * 100:.0f}%; we use ~{use_ltv * 100:.0f}%.",
                f"Borrow {stable} APY (pay): {pay * 100:.2f}%.",
                f"Lend {stable} APY (earn): {earn * 100:.2f}% on {lend_name}.",
                f"Net on borrowed dollars: {sign}. Yield is on the loan, not on 100% of the bitcoin.",
                "Example size: $100k of wrap → ~$25k dollars borrowed → net dollars per year ≈ $25k × net%.",
                "Bitcoin-price risk remains. Liquidation is the main way this blows up.",
                ("Two protocols: if either breaks, unwind can fail." if c["cross"] else "Same protocol: one set of contracts."),
            ],
            "legs": [
                {"side": "SUPPLY", "asset": wrap, "venue": borrow_name, "chain": c["chain"], "note": "Collateral"},
                {"side": "BORROW", "asset": stable, "venue": borrow_name, "chain": c["chain"], "note": f"Pay {pay * 100:.2f}%"},
                {"side": "SUPPLY", "asset": stable, "venue": lend_name, "chain": c["chain"], "note": f"Earn {earn * 100:.2f}%"},
            ],
            "maxLoss": (
                "A bitcoin crash can liquidate the wrap. A dollar-coin depeg or a second-venue failure can hit the lent dollars. "
                "Loss can exceed the extra yield by a lot."
            ),
            "risk": risk,
            "paper": paper or underwater,
            "score": _ticket_score(
                risk.get("score"),
                max(net, 0),
                defined=not c["cross"],
                core=soph == "Core",
                paper=paper or underwater,
            ),
        }

    carries = _build_dollar_carries(hacks)
    picked = []
    seen_c = set()
    for c in carries:
        if (c["net"] or 0) < 0.002:
            continue
        tag = (c["wrap"], c["stable"], c["lend_venue"], c["wrap_venue"])
        if tag in seen_c:
            continue
        seen_c.add(tag)
        picked.append(c)
        if len(picked) >= 8:
            break
    for c in picked:
        add(carry_ticket(c))
    # Textbook same-venue carry even if currently negative — paper so the math is visible.
    textbook = next(
        (
            c
            for c in carries
            if not c["cross"]
            and c["wrap"] in {"WBTC", "CBBTC"}
            and c["stable"] == "USDC"
            and "aave" in (c["wrap_venue"] or "")
            and c["chain"] == "Ethereum"
        ),
        None,
    )
    if textbook and textbook not in picked:
        add(carry_ticket(textbook, paper=True))

    btc_btc = None
    btc_stable = None
    btc_eth = None
    for p in pools:
        kind = _pair_kind(p.get("symbol"))
        tvl = p.get("tvlUsd") or 0
        if tvl < 5e6:
            continue
        proj = (p.get("project") or "").lower()
        if not any(k in proj for k in ("curve", "uniswap", "fluid-dex", "aerodrome")):
            continue
        if kind == "btc-btc" and (btc_btc is None or tvl > (btc_btc.get("tvlUsd") or 0)):
            btc_btc = p
        elif kind == "btc-stable" and (btc_stable is None or tvl > (btc_stable.get("tvlUsd") or 0)):
            btc_stable = p
        elif kind == "btc-eth" and (btc_eth is None or tvl > (btc_eth.get("tvlUsd") or 0)):
            btc_eth = p

    if btc_btc:
        add(from_pool(
            btc_btc,
            kind="dex",
            id="lp-btc-btc",
            title=f"Put two bitcoin-IOUs in a pool ({btc_btc.get('symbol')})",
            family="LP",
            sophistication="Core",
            intent="You deposit two flavors of wrapped bitcoin (for example WBTC and cbBTC). Traders swap between them and you earn a small fee. Because both sides are bitcoin, you do not lose much when bitcoin’s price moves — you mainly risk one wrap going off-price versus the other.",
            gate="Both tokens trade close to bitcoin. The pool is large enough to leave. You can sell either wrap.",
            exit="Leave if either wrap drifts ~0.8% from bitcoin, or if the pool shrinks fast.",
            how=[
                f"Get both tokens in {btc_btc.get('symbol')}.",
                f"Deposit them together on {btc_btc.get('project')} ({btc_btc.get('chain')}).",
                "You receive a pool token. Fees accrue in the pool.",
                "Withdraw both sides when you want out.",
            ],
            assumptions=[
                "This is the ‘safe-ish’ pool: bitcoin vs bitcoin, not bitcoin vs dollars.",
                "Fees are usually thin. You are paid for wrap-basis risk, not for bitcoin going up.",
            ],
            legs=[{"side": "LP", "asset": btc_btc.get("symbol"), "venue": btc_btc.get("project"), "chain": btc_btc.get("chain")}],
            maxLoss="If one wrap breaks, the pool can leave you holding the broken one. Plus both issuers and the pool contract.",
        ))

    if btc_stable:
        add(from_pool(
            btc_stable,
            kind="dex",
            id="lp-btc-stable",
            title=f"Bitcoin vs dollars in a pool ({btc_stable.get('symbol')})",
            family="LP",
            sophistication="Advanced",
            intent="You deposit wrapped bitcoin and a dollar coin. Fees look juicy because the pair moves a lot. If bitcoin rallies, the pool sells bitcoin and loads dollars — you lag a simple hold. That gap is called impermanent loss. This is a bet that bitcoin chops, not that it trends.",
            gate="You are okay ending up with fewer bitcoin if the price rips. Size this as a slice, not the whole stack.",
            exit="Leave if bitcoin trends hard, or if the wrap or the dollar coin wobbles.",
            how=[
                f"Deposit both sides of {btc_stable.get('symbol')} on {btc_stable.get('project')}.",
                "Compare your bitcoin amount to ‘just hold WBTC’ once a week. If you are behind by more than you earned in fees, the trade is losing.",
            ],
            assumptions=[
                "A 30% bitcoin move can wipe a year of fees. We treat that as the main risk, not the headline APY.",
                "You are not ‘holding 1 bitcoin’ in this pool. You are holding a mix that changes.",
            ],
            legs=[{"side": "LP", "asset": btc_stable.get("symbol"), "venue": btc_stable.get("project"), "chain": btc_stable.get("chain")}],
            maxLoss="Impermanent loss versus holding bitcoin, plus wrap, dollar-coin, and pool contract risk.",
        ))

    if False and btc_eth:
        add(from_pool(
            btc_eth,
            kind="dex",
            id="lp-btc-eth",
            title=f"Bitcoin vs ether in a pool ({btc_eth.get('symbol')})",
            family="LP",
            sophistication="Genius",
            intent="You are betting on the bitcoin/ether ratio, not on ‘earning 20%’. The pool rebalances as that ratio moves. Fees can look huge on a chart and still lose to just holding bitcoin. Treat this as a ratio trade with a small size.",
            gate="You have a view on bitcoin vs ether and a plan to rebalance. Do not treat a high fee APY as locked-in interest.",
            exit="Leave if the ratio runs through your range, or if your liquidity is no longer being used (fees drop to ~0).",
            how=[
                f"Deposit {btc_eth.get('symbol')} on {btc_eth.get('project')} in a price range you understand (especially on Uniswap v3).",
                "If the price leaves your range, you hold only one asset and earn nothing until you move the range.",
            ],
            assumptions=[
                "Fee APY is path-dependent. We do not use 20–40% as a coupon in the ranking.",
                "Size: a few percent of the bitcoin stack, not the core.",
            ],
            legs=[{"side": "LP", "asset": btc_eth.get("symbol"), "venue": btc_eth.get("project"), "chain": btc_eth.get("chain")}],
            maxLoss="Ratio moves against you (impermanent loss) can beat fees in weeks, plus both networks’ risks.",
        ))

    lombard = next((r for r in wraps.get("table") or [] if r.get("slug") == "lombard-lbtc"), None)
    bab = get_defillama_protocols()["by_slug"].get("babylon-protocol")
    if lombard or bab:
        proto = bab or {}
        risk = (lombard or {}).get("risk") or score_risk(
            {"kind": "staking", "audits": _audit_score(proto), "tvl": proto.get("tvl"), "chain": "bitcoin", "extraHop": True}
        )
        stake_pool = _best_pool(pools, project_has=("lombard", "babylon"), symbol_has=("LBTC", "BTC"))
        view = _apy_view({**(stake_pool or {}), "project": (stake_pool or {}).get("project") or "lombard-lbtc"})
        add({
            "id": "lbtc-babylon",
            "title": "Hold LBTC (restaked bitcoin receipt)",
            "family": "Restake",
            "sophistication": "Core",
            "intent": (
                "LBTC is a receipt: your bitcoin is locked to help secure other networks (Babylon-style restaking). "
                "You still move with bitcoin’s price, plus extra risk if that lock is slashed or the receipt stops tracking. "
                "This is not ‘staking bitcoin the way Ethereum staking works’, and it is not a 32% dollar yield. "
                "Cash interest has been around 1% or less; bigger numbers are usually points."
            ),
            "gate": "LBTC’s price is close to bitcoin. You accept extra slash/wrap risk for a small cash yield plus points you may never cash.",
            "exit": "Sell or unstake if LBTC drifts ~0.8% from bitcoin, if a lot of money leaves, or if restaking rules change.",
            "apy": view.get("headline"),
            "apyCash": view.get("cash"),
            "apyNote": view.get("note"),
            "apyInflated": bool(view.get("inflated")),
            "tvl": (lombard or {}).get("tvl") or proto.get("tvl"),
            "chain": "Bitcoin / Ethereum",
            "venue": "Lombard / Babylon",
            "how": [
                "Mint or buy LBTC (Lombard’s receipt on restaked bitcoin).",
                "Hold it. You do not need to lend it for this ticket.",
                "Treat points as a lottery ticket, not as income in the ranking.",
            ],
            "assumptions": [
                "Cash yield we rank on: about 0.3–1% per year, not 32%.",
                "Extra risk vs holding bitcoin: Lombard + Babylon slash/finality + the receipt’s peg.",
                "If you would not take that stack for ~1%, skip this row.",
            ],
            "legs": [{"side": "HOLD", "asset": "LBTC", "venue": "Lombard", "note": "Receipt — not native bitcoin yield"}],
            "maxLoss": "Slash, wrap failure, or depeg can exceed a year of true cash yield in a day.",
            "risk": risk,
            "paper": False,
            "score": _ticket_score(risk.get("score"), view.get("cash") or 0.01, defined=True, core=True),
        })

    if False and aave_wbtc:
        row = _pool_row(aave_wbtc, hacks, kind="lending")
        risk = score_risk(
            {
                "kind": "lending",
                "audits": row.get("audits") or 2,
                "tvl": row.get("tvl"),
                "chain": "ethereum",
                "needsOracle": True,
                "oracles": row.get("oracles") or ["Chainlink"],
                "hack": row.get("hack"),
            }
        )
        bumped = min(100, (risk.get("score") or 40) + 12)
        risk = {**risk, "score": bumped, "grade": "C+" if bumped >= 58 else risk.get("grade")}
        ltv_cap = row.get("ltv") or 0.73
        add({
            "id": "aave-wbtc-borrow-usdc",
            "title": "Deposit WBTC, borrow some dollars (small loan)",
            "family": "Leverage",
            "sophistication": "Advanced",
            "intent": "You keep bitcoin exposure and take a dollar loan against it. This is a loan, not extra yield. If bitcoin falls enough, Aave sells your WBTC. We keep the loan small so a normal dip does not liquidate you.",
            "gate": "After a 35% bitcoin drop your health factor is still above 1.5. WBTC tracks bitcoin. You have extra dollars ready to repay.",
            "exit": "Repay first if health factor drops under 1.6, if the price feed looks wrong, or if WBTC drifts from bitcoin. Do not add more borrow to ‘fix’ it.",
            "apy": None,
            "apyCash": 0,
            "tvl": row.get("tvl"),
            "chain": "Ethereum",
            "venue": "aave-v3",
            "how": [
                "Deposit 1.0 WBTC on Aave v3 Ethereum as collateral.",
                f"Aave’s max loan-to-value on this market is about {ltv_cap * 100:.0f}%. We borrow only ~25% of that cap — roughly {ltv_cap * 0.25 * 100:.0f}% of the deposit’s dollar value.",
                "Borrow USDC (dollars), not more WBTC.",
                "Park the USDC as dry powder or a boring dollar yield. Do not buy more bitcoin with it on this ticket.",
                "Watch the health factor. If it falls, repay USDC — do not hope.",
            ],
            "assumptions": [
                f"Max LTV ~{ltv_cap * 100:.0f}% (live Llama figure when available).",
                "We use ~25% of that cap so a 35% bitcoin drop still leaves a buffer.",
                "Target health factor: 2.0 or higher today; still ≥ 1.5 after −35%.",
                "You are not paid extra APY for this. You pay borrow interest on USDC.",
                "If you would use the dollars to buy more bitcoin, that is a different (riskier) trade — see the paper loop.",
            ],
            "legs": [
                {"side": "SUPPLY", "asset": "WBTC", "venue": "Aave v3", "chain": "Ethereum", "note": "Collateral"},
                {"side": "BORROW", "asset": "USDC", "venue": "Aave v3", "chain": "Ethereum", "note": "Small dollar loan — not more bitcoin"},
            ],
            "maxLoss": "A sharp bitcoin gap can sell your WBTC (liquidation). That can cost more than the dollars you borrowed.",
            "risk": risk,
            "paper": False,
            "score": _ticket_score(risk.get("score"), 0.01, defined=False, core=False),
        })

    pendle = _best_pool(pools, project_has=("pendle",), symbol_has=("LBTC", "WBTC", "CBBTC", "BTC"))
    if pendle:
        add(from_pool(
            pendle,
            kind="staking",
            id="pendle-btc",
            title=f"Pendle on {pendle.get('symbol')} — pick PT or YT, not both",
            family="Restake",
            sophistication="Advanced",
            intent="Pendle splits a yielding token into PT (you lock a fixed rate if you hold to the end date) and YT (you bet that the yield will be higher than the market thinks). They are opposite bets. Read the ticker — a USDC-named pool is not a bitcoin coupon.",
            gate="You know the maturity date. You know whether you bought PT or YT. The implied rate is compared to real cash yield (~1% on restaked bitcoin, not a 32% headline).",
            exit="Sell if the wrap underneath drifts, or if you bought YT and implied yield collapses.",
            how=[
                "Open the Pendle market and read the token: PT vs YT, and which asset it sits on.",
                "PT: you are locking a rate to a date. YT: you can lose most of the premium if yield falls.",
                "Size YT like an option, not like a savings account.",
            ],
            assumptions=[
                "We only list this if Llama has a bitcoin-related Pendle pool live.",
                "Fixed rate on PT cannot be compared to a points-inflated LBTC headline.",
            ],
            legs=[{"side": "BUY", "asset": pendle.get("symbol"), "venue": "Pendle", "chain": pendle.get("chain")}],
            maxLoss="PT: wrap + Pendle + the rate being wrong. YT: the token can go near zero.",
        ))

    loop_risk = score_risk(
        {
            "kind": "lending",
            "audits": 2,
            "tvl": 1e9,
            "chain": "ethereum",
            "needsOracle": True,
            "oracles": ["Chainlink"],
        }
    )
    loop_risk = {**loop_risk, "score": min(100, (loop_risk.get("score") or 40) + 22), "grade": "D"}
    add({
        "id": "wbtc-loop",
        "title": "Paper example: loop WBTC once (1.0 → 1.4)",
        "family": "Leverage",
        "sophistication": "Genius",
        "intent": "A loop means using the same bitcoin as collateral more than once so your deposit looks bigger. We write a single extra loop: 1.0 WBTC in, 1.4 WBTC supplied, 0.4 borrowed. It is PAPER because one sharp drop can erase the extra — and sometimes the original. The extra yield is a thin spread, not 32%.",
        "gate": "Learning only on this dashboard. If you ever did this elsewhere: health factor ≥ 2.0 now and ≥ 1.5 after bitcoin −35%. Stop after one loop.",
        "exit": "Any health-factor warning: repay, do not add. Same if WBTC leaves bitcoin’s price.",
        "apy": None,
        "chain": "Ethereum",
        "venue": "Aave v3",
        "how": [
            "Start with 1.0 WBTC on Ethereum (already wrapped).",
            "Deposit 1.0 WBTC on Aave v3 as collateral.",
            "Borrow 0.40 WBTC against it (about 40% LTV — we stay near half of Aave’s ~73% cap).",
            "Deposit that 0.40 WBTC too. You now show 1.40 supplied and 0.40 borrowed.",
            "Stop. Check health factor ≥ 2.0. Do not loop a third time in this example.",
        ],
        "assumptions": [
            "Start size: 1.0 WBTC.",
            "Loop LTV: 40% (not the 73% maximum).",
            "Extra bitcoin exposure: 1.4× instead of 1.0×.",
            "Net extra yield: supply APY on 1.40 minus borrow APY on 0.40. Often well under 1% extra per year.",
            "Stress: bitcoin −35% should leave health factor ≥ 1.5. A −50% gap can still liquidate you.",
            "Why paper: that liquidation costs more than years of the extra spread. We will not size this live from the dashboard.",
        ],
        "legs": [
            {"side": "SUPPLY", "asset": "WBTC", "venue": "Aave v3", "note": "1.00 then +0.40"},
            {"side": "BORROW", "asset": "WBTC", "venue": "Aave v3", "note": "0.40 — one loop only"},
        ],
        "maxLoss": "Aave can sell the deposit in a crash. You can lose the extra 0.4 and part of the original 1.0.",
        "risk": loop_risk,
        "paper": True,
        "score": _ticket_score(loop_risk.get("score"), 0.02, defined=False, core=False, paper=True),
    })

    xchain_risk = score_risk({"kind": "yield_wrap", "audits": 1, "tvl": 5e7, "chain": "unknown", "extraHop": True})
    add({
        "id": "xchain-wrap-lend",
        "title": "Paper example: move bitcoin over, wrap, then lend",
        "family": "Leverage",
        "sophistication": "Genius",
        "intent": "Three hops: bitcoin on Bitcoin → swap to Ethereum → wrap to WBTC → deposit on Aave. Each hop can fail on its own. Extra yield is about Aave’s supply rate (often under 1%). We write the path so you can see why the juice is not worth the hops.",
        "gate": "Learning only here. Rule of thumb: do not add a hop unless extra yield is above ~3% per year after fees. This path fails that test.",
        "exit": "If any hop sticks (swap delayed, wrap paused), unwind back to bitcoin on Bitcoin. Do not add a fourth hop to ‘fix’ it.",
        "apy": None,
        "chain": "Bitcoin → Ethereum",
        "venue": "THORChain/Chainflip + WBTC + Aave",
        "how": [
            "Start with bitcoin on Bitcoin (not wrapped).",
            "Hop 1 — swap to ETH (or a bitcoin wrap) on a native path such as THORChain or Chainflip. Pay the fee and slippage.",
            "Hop 2 — if you have ETH, get WBTC. If the swap already paid WBTC, skip.",
            "Hop 3 — deposit WBTC on Aave v3 for the supply rate.",
            "To go home you reverse all three hops and pay fees again.",
        ],
        "assumptions": [
            "Extra yield vs holding bitcoin: ~0.5–1% per year (Aave WBTC supply).",
            "Round-trip hop costs: we assume 0.3–1% out and the same back (fees + slippage).",
            "Payback: many months of yield just to earn back the hops, before any hack or halt.",
            "Failure modes stacked: swap router, wrap issuer, Aave.",
            "Why paper: the path is real, the economics are not worth live size from this desk.",
        ],
        "legs": [
            {"side": "SWAP", "asset": "BTC → ETH/WBTC", "venue": "THORChain or Chainflip", "note": "Hop 1"},
            {"side": "WRAP", "asset": "WBTC", "venue": "BitGo path", "note": "Hop 2 if needed"},
            {"side": "SUPPLY", "asset": "WBTC", "venue": "Aave v3", "note": "Hop 3 — ~1% cash"},
        ],
        "maxLoss": "You can lose money on a failed hop, a wrap depeg, or Aave — not just on bitcoin’s price.",
        "risk": xchain_risk,
        "paper": True,
        "score": _ticket_score(xchain_risk.get("score"), 0.01, defined=False, core=False, paper=True),
    })

    donot = score_risk({"kind": "yield_wrap", "audits": 0, "tvl": 2e6, "chain": "unknown", "outlier": True, "apy": 1.2, "apyReward": 1.1})
    donot = {**donot, "grade": "D", "score": max(donot.get("score") or 70, 82)}
    add({
        "id": "do-not-farm",
        "title": "Paper drill: spot a fake bitcoin farm",
        "family": "Warning",
        "sophistication": "Genius",
        "intent": "A fake farm pays you a new token instead of bitcoin interest. You are the exit — someone else sells that token into your deposit. This row is a checklist so you can recognize it, not a trade.",
        "gate": "Never enter. If two or more red flags below are true, walk away.",
        "exit": "If you already deposited: withdraw to a known wrap (WBTC/cbBTC/tBTC) or to bitcoin, then stop.",
        "apy": None,
        "chain": "—",
        "venue": "clone farm",
        "how": [
            "Write down who issued the ‘bitcoin’ token. If it is not BitGo, Coinbase, Threshold, Stacks, or another name you can check — red flag.",
            "Write down how much of the APY is a reward token vs bitcoin interest. If rewards are most of it — red flag.",
            "Write down TVL. Under about $5m with an anonymous team — red flag.",
            "If the site needs you to ‘approve unlimited’ and you cannot name the auditor — red flag.",
        ],
        "assumptions": [
            "Example of what ‘bad’ looks like: 80% APY, all in a brand-new token, unaudited, TVL $2m.",
            "You are not late to a secret — you are the liquidity for someone else’s token sale.",
            "Why paper: this is a recognition drill. There is no size.",
        ],
        "legs": [{"side": "AVOID", "asset": "unknown wrap + reward token", "venue": "clone farm"}],
        "maxLoss": "All of the deposit.",
        "risk": donot,
        "paper": True,
        "score": _ticket_score(donot.get("score"), 0, defined=False, core=False, paper=True),
    })

    add({
        "id": "do-not-unbacked",
        "title": "Paper drill: reject an opaque bitcoin IOU",
        "family": "Warning",
        "sophistication": "Genius",
        "intent": "If nobody will say who holds the real bitcoin, you do not have a wrap — you have a story. This row is how we check IOUs on this desk.",
        "gate": "Never hold it. You need a named custodian, a named signer set, or a public proof-of-reserves you can actually open.",
        "exit": "If you already hold it, sell into a known wrap or back to bitcoin while the market still prices it near 1:1.",
        "apy": None,
        "chain": "—",
        "venue": "unknown issuer",
        "how": [
            "Ask: who can I sue or check if the bitcoin is missing? Write the name.",
            "Ask: can I redeem 1 token for 1 bitcoin through a documented path?",
            "Ask: does a public dashboard show the matching bitcoin? Open it.",
            "If any answer is ‘trust us’ — treat the token as unbacked.",
        ],
        "assumptions": [
            "Known IOUs on this desk: WBTC (BitGo), cbBTC (Coinbase), tBTC (Threshold), sBTC (Stacks). Everything else starts at ‘prove it’.",
            "A high APY does not prove reserves. It often pays you to stop asking.",
            "Why paper: checklist only. No live size.",
        ],
        "legs": [{"side": "AVOID", "asset": "unnamed bitcoin IOU", "venue": "unknown issuer"}],
        "maxLoss": "All of the token’s value if the bitcoin was never there.",
        "risk": donot,
        "paper": True,
        "score": _ticket_score(donot.get("score"), 0, defined=False, core=False, paper=True),
    })

    tickets.sort(key=lambda t: (t.get("score") or {}).get("composite") or 0, reverse=True)
    for i, t in enumerate(tickets, 1):
        t["rank"] = i
        t["id"] = str(i)

    median = None
    scores = [(t.get("risk") or {}).get("score") for t in tickets if not t.get("paper")]
    if scores:
        median = sorted(scores)[len(scores) // 2]
    heroes = [
        {
            "name": "Live tickets",
            "value": len([t for t in tickets if not t.get("paper")]),
            "sub": f"{len(tickets)} incl. dollar carry and paper examples",
            "kind": "count",
        },
        {
            "name": "Top composite",
            "value": (tickets[0].get("score") or {}).get("composite") if tickets else None,
            "sub": tickets[0]["title"] if tickets else "—",
            "kind": "score",
        },
        {
            "name": "Median live risk",
            "value": median,
            "sub": "Fragility 0–100 on non-paper tickets",
            "kind": "risk",
        },
        {
            "name": "Wraps priced",
            "value": len(priced),
            "sub": "Peg panel from coins.llama.fi",
            "kind": "count",
        },
    ]
    out = _payload_base("strategies", "BTC DeFi strategies", "DeFi Llama · coins.llama.fi")
    out.update(
        {
            "heroes": heroes,
            "riskKpis": [],
            "tickets": tickets,
            "table": tickets,
            "tableMode": "strategies",
            "prices": wraps.get("prices") or [],
        }
    )
    return out


DEFI_FETCHERS = {
    "wrapped": fetch_defi_wrapped,
    "stables": fetch_defi_stables,
    "bridges": fetch_defi_bridges,
    "lending": fetch_defi_lending,
    "borrowing": fetch_defi_borrowing,
    "liquidity": fetch_defi_liquidity,
    "staking": fetch_defi_staking,
    "strategies": fetch_defi_strategies,
}


def get_defi_payload(section, *, refresh=False):
    fetcher = DEFI_FETCHERS.get(section)
    if not fetcher:
        raise ValueError(f"Unknown DeFi section: {section}")
    key = f"defi:v5:{section}"
    cached = _cget(key, _ttl(), refresh=refresh)
    if cached is not None:
        return cached
    data = fetcher()
    _cset(key, data, _ttl())
    return data
