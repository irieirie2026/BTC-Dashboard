"""Educational copy for Misc → Bitcoin chart panels (expandable details sections)."""

from __future__ import annotations

from typing import Any

from btc_data.config import CHART_INFO

# Extra history / limitations / explanation paragraphs keyed by indicator id.
EDUCATION_SUPPLEMENT: dict[str, dict[str, Any]] = {
    "mvrv": {
        "history": [
            "2017 and 2021 cycle peaks printed MVRV above 3.5× before major drawdowns.",
            "2018–2019 and 2022 bear markets often saw MVRV compress toward or below 1×.",
        ],
        "limitations": [
            "Aggregate metric — does not distinguish short- vs long-term holder behavior (use STH/LTH MVRV).",
            "Realized cap methodology varies slightly by data vendor.",
        ],
    },
    "mvrv_z_score": {
        "history": [
            "Readings above 7σ preceded the 2013, 2017, and 2021 blow-off tops.",
            "Negative Z-scores often aligned with late bear accumulation windows.",
        ],
        "limitations": [
            "Z-score assumes a stable historical distribution — regime shifts can change what 'extreme' means.",
        ],
    },
    "nupl": {
        "history": [
            "NUPL above 0.75 marked euphoria phases before prior cycle tops.",
            "Capitulation zones (NUPL ≤ 0) historically offered asymmetric risk/reward for long horizons.",
        ],
        "limitations": [
            "Paper profit metric — does not measure realized selling until coins move.",
        ],
    },
    "stock_to_flow": {
        "explanation": [
            "Stock-to-Flow (S2F) compares how much Bitcoin already exists (stock) to how much is "
            "issued per year (flow). Assets with high S2F — gold is often cited around 62 — tend "
            "to trade at scarcity premia because new supply is small relative to existing stock.",
            "Bitcoin's flow halves roughly every four years at halvings, stepping S2F higher and "
            "making each unit of stock harder to reproduce. The model plots spot price against a "
            "log-log regression on S2F to estimate scarcity-implied fair value.",
        ],
        "history": [
            "Post-2012, 2016, and 2020 halvings, S2F stepped materially higher within months.",
            "2017 and 2021 bull markets saw price trade well above the regression band before reverting.",
        ],
        "limitations": [
            "Single-variable scarcity model — ignores demand, liquidity, regulation, and macro rates.",
            "Model price is a curve-fit; halving anticipation can front-run the mechanical S2F change.",
        ],
    },
    "power_law": {
        "explanation": [
            "The Power Law Theory (Santostasi) treats Bitcoin's long-run price as a power function of "
            "time since the Genesis block — a straight line on log-log axes spanning more than a decade.",
            "The ratio chart shows spot divided by fair value, with support and resistance bands derived "
            "from historical deviations. Extended periods above resistance have marked bubble phases; "
            "dips toward support have aligned with deep value zones.",
        ],
        "limitations": [
            "Assumes continued scale-invariant adoption; breaks if growth stalls permanently.",
            "Early-era price data quality affects the fitted exponent.",
        ],
    },
}


def _bands_to_interpretation(bands: list[dict] | None) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for band in bands or []:
        label = str(band.get("label") or "").strip()
        if not label:
            continue
        if "—" in label:
            zone, meaning = label.split("—", 1)
            rows.append({"zone": zone.strip(), "meaning": meaning.strip()})
        elif " - " in label:
            zone, meaning = label.split(" - ", 1)
            rows.append({"zone": zone.strip(), "meaning": meaning.strip()})
        else:
            rows.append({"zone": label, "meaning": label})
    return rows


def build_chart_education() -> dict[str, dict[str, Any]]:
    """Merge CHART_INFO, supplements, and valuation model content into one catalog."""
    from btc_data.valuation_models import VALUATION_MODELS

    out: dict[str, dict[str, Any]] = {}
    for key, info in CHART_INFO.items():
        supplement = EDUCATION_SUPPLEMENT.get(key, {})
        explanation = list(supplement.get("explanation") or [])
        if info.get("description") and info["description"] not in explanation:
            explanation.insert(0, info["description"])
        out[key] = {
            "explanation": explanation,
            "howItWorks": supplement.get("howItWorks") or info.get("readings") or "",
            "formula": supplement.get("formula") or info.get("formula"),
            "interpretation": supplement.get("interpretation") or _bands_to_interpretation(info.get("hoverBands")),
            "history": list(supplement.get("history") or info.get("history") or []),
            "limitations": list(supplement.get("limitations") or info.get("limitations") or []),
        }
    for mid, model in VALUATION_MODELS.items():
        content = dict(model.get("content") or {})
        if model.get("tagline") and content.get("explanation"):
            pass
        elif model.get("tagline"):
            content.setdefault("explanation", [model["tagline"]])
        out[mid] = content
    if "fear_greed" in out:
        hist = dict(out["fear_greed"])
        hist["explanation"] = [
            "Twelve-month history of the Crypto Fear & Greed Index (0–100) from Alternative.me.",
            "Use the gauge for today's reading; use this chart for persistence — sustained extreme "
            "readings matter more than single-day spikes.",
        ]
        out["fear_greed_history"] = hist
    if "funding_rate" in out and "market_structure" not in out:
        out["market_structure"] = dict(out["funding_rate"])
        out["market_structure"]["explanation"] = [
            "Perpetual futures positioning snapshot: median funding rate across venues plus Binance "
            "BTCUSDT open interest.",
            "Funding shows who pays whom to hold leverage; OI shows how much notional is outstanding.",
        ]
    return out