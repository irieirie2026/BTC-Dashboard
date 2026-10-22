"""HTTP errors that are not missing routes.

ValueError in the dispatcher is a 404. A bad query parameter is a 400.
"""

from __future__ import annotations


class BadRequest(Exception):
    def __init__(self, message: str, *, accepted: list[str] | None = None):
        super().__init__(message)
        self.accepted = list(accepted or [])


_TIMESPAN_ALIASES = {
    "7d": "7days",
    "7day": "7days",
    "7days": "7days",
    "30d": "30days",
    "30day": "30days",
    "30days": "30days",
    "60d": "60days",
    "60day": "60days",
    "60days": "60days",
    "90d": "90days",
    "90day": "90days",
    "90days": "90days",
    "1y": "1year",
    "1yr": "1year",
    "1year": "1year",
    "2y": "2years",
    "2yr": "2years",
    "2years": "2years",
    "4y": "4years",
    "4yr": "4years",
    "4years": "4years",
    "all": "all",
    "max": "all",
}

ONCHAIN_TIMESPANS = ("7days", "30days", "60days", "90days", "1year", "2years")
SERIES_TIMESPANS = ONCHAIN_TIMESPANS + ("4years", "all")


def canonical_timespan(raw: str | None, *, kind: str) -> str:
    """Map 30d / 1y / 7days onto the span the chart stores. Unknown values are a 400."""
    allowed = ONCHAIN_TIMESPANS if kind == "onchain" else SERIES_TIMESPANS
    text = str(raw or "").strip().lower()
    if not text:
        return "30days" if kind == "onchain" else "all"
    canon = _TIMESPAN_ALIASES.get(text)
    if canon not in allowed:
        aliases = "30d, 1y, 1yr, 7d, 7days, 60d, 90d, 2y, 4y"
        raise BadRequest(
            f"Unknown timespan {raw!r}. Accepted: {', '.join(allowed)}. Aliases: {aliases}.",
            accepted=list(allowed),
        )
    return canon
