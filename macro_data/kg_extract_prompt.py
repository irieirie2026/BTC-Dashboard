"""Reusable LLM extraction prompts for Knowledge Graph v5."""

NODE_TYPE_GUIDE = """\
TYPE DECISION TREE (apply in order — never default everything to org/concept/entity):
1. Named human (First Last, official title, "said/announced") → person
2. Regulator / central bank / treasury (SEC, CFTC, Federal Reserve, ECB) → government_body
3. Bank / exchange / asset manager (Coinbase, BlackRock, Binance, Grayscale) → financial_institution
4. Generic company without financial-institution role → org
5. Ticker / coin / commodity → asset (use canonical label Bitcoin, not BTC)
6. ETF / fund / trust product → product
7. Futures / options / perps → derivative
8. USDT / USDC / DAI → stablecoin
9. On-chain or mining measurement (hash rate, SOPR, MVRV) → metric
10. Macro data series (CPI, PPI, unemployment, interest rates) → indicator
11. Named index (DXY, S&P 500, VIX) → market_index
12. Policy action (rate cut, QE, FOMC hold) → policy
13. Regulatory framework / enforcement → regulation
14. Named law / bill / executive order → legal_instrument
15. Dated milestone (halving, launch, meeting) → event
16. Blockchain network / L2 (Lightning Network) → protocol
17. Country / region (United States, EU) → jurisdiction
18. Specific price quote ($100,000) → price_level
19. Abstract theme ONLY if none above apply → concept (max 2 per document)
20. entity — DO NOT USE (system will drop these)
"""

ALIAS_RULES = """\
ALIAS RULES (critical):
- BTC, XBT, and Bitcoin are ONE entity — emit only "Bitcoin" (type asset), never both.
- ETH and Ethereum are ONE entity — emit only "Ethereum".
- Fed and Federal Reserve are ONE entity — emit only "Federal Reserve".
- Michael Saylor / Saylor Michael → "Michael Saylor" (person).
- Gary Gensler, Jerome Powell, Larry Fink — use standard First Last order.
- Reuse existing graph node labels when they clearly match the same entity.
"""

EXTRACT_FEW_SHOT = """\
Example input (excerpt):
"SEC Chair Gary Gensler said spot Bitcoin ETF approvals changed market structure. BlackRock's iShares Bitcoin Trust saw record inflows. BTC rallied as miners' hash rate hit new highs. The Federal Reserve held interest rates steady."

Example output:
<analysis>
Key entities: Gary Gensler (person, SEC chair), SEC (regulator), BlackRock (asset manager),
iShares Bitcoin Trust (ETF product), Bitcoin (asset — BTC mention merges here), Hash Rate (metric),
Federal Reserve (central bank), Interest Rates (indicator).
Relations: Gensler chairs SEC; BlackRock issues ETF; SEC approved ETF; ETF tracks Bitcoin; Fed sets rates.
</analysis>
{
  "nodes": [
    {"label": "Gary Gensler", "type": "person", "description": "SEC chair commenting on spot Bitcoin ETF market impact", "confidence": 95},
    {"label": "SEC", "type": "government_body", "description": "US securities regulator overseeing ETF approvals", "confidence": 98},
    {"label": "BlackRock", "type": "financial_institution", "description": "Asset manager running the iShares Bitcoin Trust ETF", "confidence": 96},
    {"label": "iShares Bitcoin Trust", "type": "product", "description": "Spot Bitcoin ETF product with record inflows", "confidence": 94},
    {"label": "Bitcoin", "type": "asset", "description": "BTC rallied per article — underlying crypto asset", "confidence": 99},
    {"label": "Hash Rate", "type": "metric", "description": "Mining network compute reaching new highs", "confidence": 93},
    {"label": "Federal Reserve", "type": "government_body", "description": "US central bank holding interest rates steady", "confidence": 97},
    {"label": "Interest Rates", "type": "indicator", "description": "Policy rates held steady by the Fed", "confidence": 90}
  ],
  "edges": [
    {"source": "Gary Gensler", "target": "SEC", "label": "chairs", "description": "Gary Gensler is SEC chair", "confidence": 92},
    {"source": "BlackRock", "target": "iShares Bitcoin Trust", "label": "issues", "description": "BlackRock operates the spot BTC ETF", "confidence": 94},
    {"source": "SEC", "target": "iShares Bitcoin Trust", "label": "approved", "description": "SEC approved spot ETF listings", "confidence": 91},
    {"source": "iShares Bitcoin Trust", "target": "Bitcoin", "label": "tracks", "description": "ETF holds and tracks spot BTC", "confidence": 96},
    {"source": "Federal Reserve", "target": "Interest Rates", "label": "sets", "description": "Fed held policy rates steady", "confidence": 93}
  ]
}
"""


def build_extract_system_prompt() -> str:
    return (
        "You extract knowledge-graph nodes and edges from crypto/finance documents.\n"
        "First write a brief <analysis> block listing entities, types, and key relations.\n"
        "Then output valid JSON with keys \"nodes\" and \"edges\" only (after </analysis>).\n"
        f"{NODE_TYPE_GUIDE}\n"
        f"{ALIAS_RULES}\n"
        "Each node: label, type, description (one evidence sentence), confidence (0-100 integer).\n"
        "Each edge: source, target (labels exactly as in nodes), label (snake_case relation), "
        "description (evidence), confidence (0-100).\n"
        "Prefer concrete research-useful entities. Do not invent facts. "
        "Limit to 20 high-quality nodes and 30 edges."
    )


def build_extract_user_prompt(
    *,
    document_text: str,
    title: str = "",
    known_block: str = "(none)",
    goal_block: str = "",
) -> str:
    return (
        f"{EXTRACT_FEW_SHOT}\n\n"
        f"Existing graph nodes (reuse labels when matching):\n{known_block}\n\n"
        f"Document title: {title or 'Untitled'}"
        f"{goal_block}\n\n"
        f"<document>\n{document_text}\n</document>\n\n"
        "Write <analysis> then JSON."
    )