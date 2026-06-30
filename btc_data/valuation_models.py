"""Catalog and API assembly for Misc → Bitcoin → Valuation Models."""

from __future__ import annotations

import time
from typing import Any, Callable

from btc_data.config import BGEOMETRICS_TTL
from btc_data.fetchers import fetch_bgeometrics_series, fetch_blockchain_chart
from btc_data.valuation_computed import (
    compute_balanced_price,
    compute_difficulty_ribbon,
    compute_metcalfe,
    compute_pi_cycle,
    compute_power_law,
    compute_rainbow,
    compute_stock_to_flow,
    compute_stock_to_flow_cross,
)
from macro_data.cache import cache_get, cache_set

# model_id → destination Bitcoin subtab (valuation | onchain | miner)
TAB_MODELS: dict[str, list[str]] = {
    "valuation": [
        "stock_to_flow",
        "stock_to_flow_cross",
        "power_law",
        "delta_balanced_price",
        "pi_cycle_top",
        "rainbow_chart",
    ],
    "onchain": ["nvt_ratio", "metcalfe", "coin_days_destroyed"],
    "miner": ["difficulty_ribbon"],
}

VM_INTRO = {
    "title": "Valuation frameworks",
    "paragraphs": [
        "Educational valuation frameworks — scarcity math, cycle signals, and on-chain equilibrium models. "
        "Compare several independent lenses; each has limitations noted in the cards below.",
    ],
}


def _model(
    model_id: str,
    *,
    category: str,
    title: str,
    tagline: str,
    source: str,
    format: str,
    unit: str,
    help_key: str,
    explanation: list[str],
    how_it_works: str,
    formula: str | None,
    interpretation: list[dict[str, str]],
    history: list[str],
    limitations: list[str],
    series_type: str = "line",
    chart_color: str = "#f59e0b",
) -> dict[str, Any]:
    return {
        "id": model_id,
        "category": category,
        "title": title,
        "tagline": tagline,
        "source": source,
        "format": format,
        "unit": unit,
        "helpKey": help_key,
        "seriesType": series_type,
        "chartColor": chart_color,
        "content": {
            "explanation": explanation,
            "howItWorks": how_it_works,
            "formula": formula,
            "interpretation": interpretation,
            "history": history,
            "limitations": limitations,
        },
    }


VALUATION_MODELS: dict[str, dict[str, Any]] = {
    "stock_to_flow": _model(
        "stock_to_flow",
        category="scarcity",
        title="Stock-to-Flow (S2F)",
        tagline="Scarcity ratio linking stock, issuance, and price",
        source="Computed · halving schedule",
        format="ratio",
        unit="×",
        help_key="mb-vm-s2f",
        explanation=[
            "Stock-to-Flow (S2F) measures scarcity: how much Bitcoin already exists (stock) versus how much "
            "is produced each year (flow). Gold's high S2F (~62) is often cited as a reason it holds value — "
            "new supply is tiny compared to vaulted stock.",
            "Bitcoin's flow drops by half at each halving, so S2F steps higher on a predictable schedule. "
            "PlanB's model regresses log-price on log-S2F, arguing these scarcity upgrades explain much of "
            "BTC's long-run appreciation.",
            "The chart plots the live S2F ratio and compares spot price to the regression-implied model price. "
            "When spot trades far above the model, the market is paying a scarcity premium; far below suggests "
            "the market is discounting the stock/flow thesis.",
        ],
        how_it_works="Stock = circulating BTC supply. Flow = estimated annual issuance from block subsidies "
        "(halving schedule × blocks per year). S2F = Stock ÷ Flow. Model price comes from a log-log regression "
        "fitted on historical S2F and price. The ratio line shows the live S2F; overlay compares spot vs model.",
        formula="S2F = Stock / Flow  ·  log(Price) ≈ a + b × log(S2F)",
        interpretation=[
            {"zone": "Low S2F (pre-halving era)", "meaning": "Higher flow relative to stock — historically cheaper zone"},
            {"zone": "High S2F (post-halving)", "meaning": "Greater scarcity — model implies higher fair value"},
            {"zone": "Price >> model", "meaning": "Trading above scarcity-implied value — overheated vs S2F"},
            {"zone": "Price << model", "meaning": "Below scarcity-implied value — potential accumulation zone"},
        ],
        history=[
            "2012, 2016, and 2020 halvings each reduced flow and lifted S2F within months.",
            "2016–2017 and 2020–2021 bull markets followed halving-driven scarcity upgrades.",
            "The model gained wide attention after 2019; the 2021 peak traded well above the regression band before mean-reverting.",
            "2022–2023 bear saw spot approach and undershoot model-implied levels at times.",
        ],
        limitations=[
            "Single-variable scarcity model — demand, rates, regulation, and ETF flows are not in the formula.",
            "Regression is fit on one asset; critics argue post-hoc curve-fitting.",
            "Flow uses subsidy estimates; transaction fees and lost coins add noise to 'stock'.",
            "Markets can front-run halvings, so price may move before the mechanical S2F step.",
        ],
    ),
    "stock_to_flow_cross": _model(
        "stock_to_flow_cross",
        category="scarcity",
        title="Stock-to-Flow Cross Asset (S2FX)",
        tagline="S2F with halving-phase transitions across asset classes",
        source="Computed · S2FX phases",
        format="ratio",
        unit="×",
        help_key="mb-vm-s2fx",
        explanation=[
            "Stock-to-Flow Cross Asset (S2FX) extends plain S2F by tagging each halving era as a distinct "
            "scarcity phase — similar to how gold and silver sit in different scarcity clusters.",
            "The idea: as Bitcoin graduates to higher phases, its valuation cluster should re-rate toward "
            "harder-money comparables, with each halving marking a phase transition.",
            "Use this alongside base S2F: phases help frame where we are in the multi-year scarcity cycle, "
            "not just the absolute ratio today.",
        ],
        how_it_works="Computes the same S2F ratio as the base model, then labels each date with halving-era "
        "phase (1 through 4). Phase boundaries align with supply shocks that mechanically increase S2F. "
        "Model price uses phase-aware regression bands.",
        formula="S2F = Stock / Flow  ·  Phase ∈ {1…4} by halving era",
        interpretation=[
            {"zone": "Phase 1–2", "meaning": "Early scarcity regimes — highest percentage upside historically"},
            {"zone": "Phase 3–4", "meaning": "Mature scarcity — smaller marginal S2F jumps per halving"},
            {"zone": "Cross-phase", "meaning": "Transitions often coincide with multi-year bull cycles"},
        ],
        history=[
            "2012, 2016, and 2020 halvings each triggered phase transitions with higher S2F.",
            "2020 halving moved BTC into phase 4 territory as S2F crossed ~50.",
            "Major bull runs have often started after phase transitions as markets reprice scarcity.",
        ],
        limitations=[
            "Phase boundaries are stylized — not an official consensus definition.",
            "Cross-asset analogy to metals is illustrative, not proof.",
            "Inherits all limitations of the underlying S2F regression.",
        ],
    ),
    "power_law": _model(
        "power_law",
        category="scarcity",
        title="Power Law Model",
        tagline="Scale-invariant fair-value corridor since Genesis",
        source="Computed · Santostasi PLT",
        format="ratio",
        unit="×",
        help_key="mb-vm-power-law",
        series_type="band",
        chart_color="#e879f9",
        explanation=[
            "Giovanni Santostasi's Power Law Theory (PLT) models Bitcoin price as a power function of time "
            "since the Genesis block — a remarkably straight line on log-log axes across more than a decade.",
            "The ratio chart shows spot divided by fair value, with support and resistance bands from "
            "historical deviations. Extended periods above resistance have marked bubble-like blow-offs; "
            "dips toward support have aligned with generational accumulation windows.",
            "PLT is a long-horizon lens: it ignores quarterly noise and asks whether price is ahead of or "
            "behind a scale-invariant adoption curve.",
        ],
        how_it_works="Fair price = A × (days since Genesis)^n, calibrated on historical data. "
        "Ratio = spot ÷ fair. Support and resistance bands come from percentile envelopes of past deviations. "
        "Values above 1.5× resistance suggest bubble territory; below 0.4× support suggest deep discount vs trend.",
        formula="Price = A × t^n  ·  Ratio = Spot / Fair",
        interpretation=[
            {"zone": "Ratio ≤ 0.4× support", "meaning": "Deep value vs long-run trend"},
            {"zone": "0.4–1.5× corridor", "meaning": "Normal oscillation around fair value"},
            {"zone": "Ratio ≥ 1.5× resistance", "meaning": "Bubble territory vs power-law fair"},
        ],
        history=["2013, 2017, 2021 peaks exceeded resistance; 2015, 2018, 2022 lows neared support."],
        limitations=["Assumes scale-invariant adoption; breaks if Bitcoin stalls or is displaced.", "Sensitive to early-day price data quality."],
    ),
    "delta_balanced_price": _model(
        "delta_balanced_price",
        category="onchain",
        title="Delta Price / Balanced Price",
        tagline="David Puell on-chain pricing framework",
        source="BGeometrics + computed",
        format="usd",
        unit="USD",
        help_key="mb-vm-delta-balanced",
        series_type="multi",
        chart_color="#38bdf8",
        explanation=[
            "David Puell's Delta Cap framework subtracts the long-run average realized cap from today's "
            "realized cap, isolating the 'active' economic base that responds to price swings.",
            "Delta Price scales delta cap per coin; Balanced Price blends realized and delta components "
            "into a long-run equilibrium between bull euphoria and bear despair.",
            "When spot trades far above balanced price, the network is extended vs on-chain equilibrium; "
            "far below suggests depression vs fair value on this framework.",
        ],
        how_it_works="Pulls realized price and delta cap from BGeometrics, then computes balanced price as "
        "an educational proxy equilibrium line. Chart overlays spot, realized, delta, and balanced for comparison.",
        formula="Delta Cap = Realized Cap − Avg Realized Cap  ·  Balanced ≈ f(Realized, Delta)",
        interpretation=[
            {"zone": "Spot >> Balanced", "meaning": "Extended above equilibrium — overheated"},
            {"zone": "Spot ≈ Balanced", "meaning": "Fair-value equilibrium zone"},
            {"zone": "Spot << Balanced", "meaning": "Depressed vs on-chain equilibrium"},
        ],
        history=["2022 bear saw spot approach balanced/realized support cluster.", "2021 peak far above balanced."],
        limitations=["Balanced price here is simplified proxy.", "Delta cap sensitive to realized cap methodology."],
    ),
    "pi_cycle_top": _model(
        "pi_cycle_top",
        category="cycle_miner",
        title="Pi Cycle Top Indicator",
        tagline="111-day MA crossing 2× the 350-day MA",
        source="Computed · daily price",
        format="signal",
        unit="signal",
        help_key="mb-vm-pi-cycle",
        series_type="overlay",
        chart_color="#14b8a6",
        explanation=[
            "The Pi Cycle Top indicator fires when the 111-day moving average crosses above twice the "
            "350-day moving average. It has historically occurred within weeks of major cycle tops.",
            "Named because 350÷111 ≈ 3.15 (near π). It is not magic — it captures late-cycle momentum "
            "when short-term trend accelerates far above the long-term baseline.",
            "Treat it as a late-cycle warning, not a precision timing tool. Tops can form slightly before "
            "or after the cross.",
        ],
        how_it_works="Computes 111DMA and 350DMA on daily close; signal = 1 when 111DMA > 2×350DMA. "
        "Chart overlays price with both moving averages so you can see proximity to a cross.",
        formula="Signal when MA₁₁₁ > 2 × MA₃₅₀",
        interpretation=[
            {"zone": "Cross active", "meaning": "Cycle top warning — historically within ~2 weeks of peak"},
            {"zone": "No cross", "meaning": "No Pi signal — trend may continue or not be terminal"},
        ],
        history=["Fired near 2013, 2017, and 2021 cycle tops.", "Did not fire at all local highs — use as confirmation."],
        limitations=["Only 3 historical fires; small sample.", "Late signal — tops can precede cross slightly."],
    ),
    "difficulty_ribbon": _model(
        "difficulty_ribbon",
        category="cycle_miner",
        title="Difficulty Ribbon",
        tagline="Mining difficulty SMA compression and expansion",
        source="Computed · difficulty",
        format="ratio",
        unit="difficulty",
        help_key="mb-vm-difficulty-ribbon",
        series_type="ribbon",
        chart_color="#a855f7",
        explanation=[
            "The Difficulty Ribbon stacks multiple simple moving averages of Bitcoin mining difficulty. "
            "When the ribbons compress tightly, miners are often under stress (hash leaving, difficulty lagging). "
            "When ribbons expand and fan out, miner participation and network confidence are typically recovering.",
            "Pair with hash-rate and Puell charts: ribbon compression during price drawdowns has marked "
            "capitulation zones that preceded long-term bottoms.",
        ],
        how_it_works="Mining difficulty retargets roughly every two weeks. We plot SMAs from short (9) to long "
        "(200) windows on the difficulty series. Compression = MAs converging; expansion = MAs spreading.",
        formula="Difficulty Ribbon = SMA₉…SMA₂₀₀ of difficulty",
        interpretation=[
            {"zone": "Compressed ribbon", "meaning": "Miner capitulation — potential accumulation"},
            {"zone": "Expanding ribbon", "meaning": "Miner expansion — network confidence returning"},
        ],
        history=["Ribbon compression aligned with 2018–2019 and 2022 miner stress."],
        limitations=["Difficulty lags hash rate; ASIC generation changes break comparability."],
    ),
    "nvt_ratio": _model(
        "nvt_ratio",
        category="network",
        title="NVT Ratio (Signal)",
        tagline="Network value relative to on-chain transfer volume",
        source="BGeometrics",
        format="ratio",
        unit="×",
        help_key="mb-vm-nvt",
        explanation=[
            "Network Value to Transactions (NVT) compares Bitcoin's market cap to on-chain transfer volume — "
            "a price-to-'earnings' style ratio where on-chain settlement is the economic output.",
            "High NVT means price is rich relative to how much value is actually moving on-chain; low NVT "
            "suggests price is cheap vs utility. NVT Signal smooths volume to reduce noise.",
            "Useful for spotting when speculation runs ahead of organic on-chain activity.",
        ],
        how_it_works="NVT Signal = market cap ÷ smoothed daily on-chain transfer volume (BGeometrics nvts). "
        "Rising NVT with flat volume = speculative premium; falling NVT with rising volume = healthier alignment.",
        formula="NVT ≈ Market Cap / Daily On-Chain Volume (smoothed)",
        interpretation=[
            {"zone": "High NVT", "meaning": "Price rich vs on-chain utility — overheated"},
            {"zone": "Low NVT", "meaning": "Price cheap vs transfer activity — undervalued"},
            {"zone": "Rising NVT", "meaning": "Speculation outpacing usage"},
        ],
        history=["2017 blow-off saw elevated NVT.", "Bear markets compress NVT as volume falls slower than price."],
        limitations=["Exchange internal transfers skew volume.", "L2 activity invisible on-chain."],
    ),
    "metcalfe": _model(
        "metcalfe",
        category="network",
        title="Metcalfe's Law Adaptation",
        tagline="Network value scaling with the square of users",
        source="Computed · addresses²",
        format="ratio",
        unit="×",
        help_key="mb-vm-metcalfe",
        explanation=[
            "Metcalfe's Law states that a network's value scales with the square of its users (n²). "
            "This adaptation maps active addresses squared against price to test whether Bitcoin's market "
            "cap grows with network effects.",
            "When the Metcalfe ratio is high, price has outrun address growth (speculative premium). "
            "When low, price lags network expansion (potential value gap).",
        ],
        how_it_works="Uses Blockchain.info unique addresses (2y) and daily price. Fair value proxy ∝ addresses²; "
        "ratio = spot ÷ fair. Deviations highlight under- or over-valuation vs network growth.",
        formula="Value ∝ n²  ·  Ratio = Price / (Addresses²)",
        interpretation=[
            {"zone": "High ratio", "meaning": "Price ahead of Metcalfe fair — speculative premium"},
            {"zone": "Low ratio", "meaning": "Price behind network growth — potential value"},
        ],
        history=["Long-run adoption curves show correlation; short-run diverges sharply."],
        limitations=["Addresses ≠ users; exponent may not be 2 for Bitcoin."],
    ),
    "rainbow_chart": _model(
        "rainbow_chart",
        category="other",
        title="Rainbow Chart",
        tagline="Log regression color bands on long-run price",
        source="Computed · log regression",
        format="usd",
        unit="USD",
        help_key="mb-vm-rainbow",
        series_type="rainbow",
        chart_color="#22c55e",
        explanation=[
            "The Rainbow Chart applies log-linear regression to Bitcoin price and offsets colored bands for "
            "visual 'temperature' zones — from fire-sale blues to maximum-bubble reds.",
            "It began as a community meme but is widely used as a long-horizon log-scale map of cycle extremes. "
            "It is not a formal forecast — it shows where price sits vs a fitted long-run curve.",
        ],
        how_it_works="Fit log(price) vs log(days since Genesis); create parallel bands at fixed log offsets. "
        "Each band gets a color; spot price is plotted with its current band index.",
        formula="log(Price) = a + b × log(days) ± band offsets",
        interpretation=[
            {"zone": "Blue / purple (bottom)", "meaning": "Historically cheap — accumulation humor zone"},
            {"zone": "Green / yellow (mid)", "meaning": "HODL corridor"},
            {"zone": "Red (top)", "meaning": "Maximum bubble territory — sell seriousness"},
        ],
        history=["Every major peak entered red; bears touched blue/purple."],
        limitations=["Pure curve-fit; bands arbitrary.", "Not a formal statistical model."],
    ),
    "coin_days_destroyed": _model(
        "coin_days_destroyed",
        category="other",
        title="Coin Days Destroyed (CDD)",
        tagline="Weighted measure of old coins moving",
        source="BGeometrics",
        format="ratio",
        unit="CDD",
        help_key="mb-vm-cdd",
        explanation=[
            "Coin Days Destroyed (CDD) weights each on-chain move by how long those coins were dormant: "
            "coins moved × days held. A spike means old, seasoned supply changed hands.",
            "High CDD often signals distribution by long-term holders — estate moves, OTC desks, or macro "
            "profit-taking. Low CDD means young coins dominate flows (typical bull churn).",
        ],
        how_it_works="Daily CDD = sum of (BTC moved × days since last move). Chart shows raw CDD with optional "
        "90-day moving average to highlight sustained old-coin activity vs one-off spikes.",
        formula="CDD = Σ (coins moved × days held)",
        interpretation=[
            {"zone": "CDD spike", "meaning": "Old coins moving — distribution or estate settlement"},
            {"zone": "Low CDD", "meaning": "Young coins dominate — typical bull churn"},
            {"zone": "CDD 90d MA rising", "meaning": "Sustained old-coin selling pressure"},
        ],
        history=["2017 and 2021 tops saw CDD spikes.", "2020 cross-exchange shuffle also spiked CDD."],
        limitations=["Exchange internal moves inflate.", "Entity clustering needed for precision."],
    ),
}


def get_models_meta() -> dict[str, Any]:
    models = []
    seen: set[str] = set()
    for tab_id in TAB_MODELS:
        for mid in TAB_MODELS[tab_id]:
            if mid in seen:
                continue
            seen.add(mid)
            m = VALUATION_MODELS.get(mid)
            if m:
                models.append(m)
    return {
        "intro": VM_INTRO,
        "tabModels": TAB_MODELS,
        "models": models,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _safe_fetch(label: str, fn: Callable, *args, **kwargs) -> dict[str, Any]:
    try:
        result = fn(*args, **kwargs)
        if isinstance(result, dict):
            return result
        return {"value": result, "fetchedAt": _now_iso(), "source": label}
    except Exception as exc:
        return {"series": [], "latest": None, "error": str(exc), "fetchedAt": _now_iso(), "source": label}


def _chart_payload(model_id: str, data: dict[str, Any]) -> dict[str, Any]:
    meta = VALUATION_MODELS.get(model_id, {})
    return {
        "modelId": model_id,
        "series": data.get("series") or [],
        "latest": data.get("latest"),
        "source": data.get("source") or meta.get("source"),
        "fetchedAt": data.get("fetchedAt"),
        "error": data.get("error"),
        "stale": data.get("stale"),
        "note": data.get("note"),
        "unit": data.get("unit") or meta.get("unit"),
        "overlay": data.get("overlay"),
        "smas": data.get("smas"),
        "bands": data.get("bands"),
        "signals": data.get("signals"),
    }


_PRICE_CACHE: list[dict] | None = None


def _price_series(refresh: bool = False) -> list[dict]:
    global _PRICE_CACHE
    if not refresh and _PRICE_CACHE:
        return _PRICE_CACHE
    cached = cache_get("btc:bg:v2:btc_price:free", ttl=BGEOMETRICS_TTL * 7)
    if not refresh and cached and cached.get("series"):
        _PRICE_CACHE = cached["series"]
        return _PRICE_CACHE
    data = _safe_fetch("btc_price", fetch_bgeometrics_series, "btc_price", refresh=refresh)
    series = data.get("series") or []
    if series:
        _PRICE_CACHE = series
        return series
    bc = _safe_fetch("market_price", fetch_blockchain_chart, "market-price", "2years", refresh=refresh)
    _PRICE_CACHE = bc.get("series") or []
    return _PRICE_CACHE


def _cached_bgeometrics_series(metric: str) -> dict[str, Any] | None:
    token = ""
    try:
        from btc_data.fetchers import bgeometrics_token

        token = "auth" if bgeometrics_token() else "free"
    except ImportError:
        token = "free"
    cached = cache_get(f"btc:bg:v2:{metric}:{token}", ttl=BGEOMETRICS_TTL * 7)
    if cached and cached.get("series"):
        return cached
    return None


def _bgeometrics_or_cache(metric: str, *, refresh: bool = False) -> dict[str, Any]:
    if not refresh:
        cached = _cached_bgeometrics_series(metric)
        if cached:
            return {**cached, "fromCache": True, "stale": cached.get("stale")}
    return _safe_fetch("bgeometrics", fetch_bgeometrics_series, metric, refresh=refresh)


def _fetch_model_series(model_id: str, *, refresh: bool = False) -> dict[str, Any]:
    if model_id == "stock_to_flow":
        supply = _bgeometrics_or_cache("supply_current", refresh=refresh)
        return compute_stock_to_flow(_price_series(refresh), supply.get("series"))
    if model_id == "stock_to_flow_cross":
        supply = _bgeometrics_or_cache("supply_current", refresh=refresh)
        return compute_stock_to_flow_cross(_price_series(refresh), supply.get("series"))
    if model_id == "power_law":
        return compute_power_law(_price_series(refresh))
    if model_id == "pi_cycle_top":
        return compute_pi_cycle(_price_series(refresh))
    if model_id == "rainbow_chart":
        return compute_rainbow(_price_series(refresh))
    if model_id == "difficulty_ribbon":
        diff = _bgeometrics_or_cache("difficulty", refresh=refresh)
        return compute_difficulty_ribbon(diff.get("series") or [])
    if model_id == "metcalfe":
        addr = _safe_fetch("addresses", fetch_blockchain_chart, "n-unique-addresses", "2years", refresh=refresh)
        return compute_metcalfe(addr.get("series") or [], _price_series(refresh))
    if model_id == "delta_balanced_price":
        realized = _bgeometrics_or_cache("realized_price", refresh=refresh)
        delta = _bgeometrics_or_cache("delta_cap", refresh=refresh)
        balanced = compute_balanced_price(realized.get("series") or [], delta.get("series") or [])
        price = _price_series(refresh)
        return {
            **balanced,
            "overlay": {
                "realized": realized.get("series") or [],
                "delta_cap": delta.get("series") or [],
                "price": price,
            },
        }
    bg_key_map = {
        "nvt_ratio": "nvts",
        "coin_days_destroyed": "cdd",
    }
    if model_id in bg_key_map:
        return _bgeometrics_or_cache(bg_key_map[model_id], refresh=refresh)

    return {"series": [], "error": f"Unknown model: {model_id}", "fetchedAt": _now_iso()}


def get_tab_bundle(tab: str, *, refresh: bool = False) -> dict[str, Any]:
    if tab not in TAB_MODELS:
        raise ValueError(f"Unknown valuation model tab: {tab}")

    cache_key = f"btc:vm:bundle:v4:{tab}"
    if not refresh:
        cached = cache_get(cache_key, ttl=BGEOMETRICS_TTL)
        if cached is not None and any((c.get("series") or []) for c in (cached.get("charts") or {}).values()):
            return {**cached, "fromCache": True}

    charts: dict[str, dict] = {}
    errors: list[str] = []
    for model_id in TAB_MODELS[tab]:
        data = _fetch_model_series(model_id, refresh=refresh)
        charts[model_id] = _chart_payload(model_id, data)
        if data.get("error") and not data.get("series"):
            errors.append(f"{model_id}: {data['error']}")

    payload = {
        "tab": tab,
        "charts": charts,
        "fetchedAt": _now_iso(),
        "errors": sorted(set(errors)),
        "partial": bool(errors),
    }
    if any((c.get("series") or []) for c in charts.values()):
        cache_set(cache_key, payload)
    return payload


def get_category_bundle(category: str, *, refresh: bool = False) -> dict[str, Any]:
    """Deprecated alias — maps legacy category ids to tab bundles where possible."""
    legacy_tab = {
        "scarcity": "valuation",
        "onchain": "valuation",
        "cycle_miner": "miner",
        "network": "onchain",
        "other": "valuation",
    }.get(category)
    if legacy_tab:
        return get_tab_bundle(legacy_tab, refresh=refresh)
    raise ValueError(f"Unknown valuation model category: {category}")