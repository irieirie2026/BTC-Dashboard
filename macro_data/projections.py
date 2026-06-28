"""
Projection source selection: IMF World Economic Outlook + OECD Economic Outlook.

IMF WEO — global coverage, typically includes year+1 (e.g. 2026).
OECD EO — complements IMF for unreleased / projection years, especially where
IMF is missing (gdp deflator, current account) or for EO-covered economies.
"""

from __future__ import annotations

import time
from typing import Any

from macro_data.config import PROJECTION_END_YEAR
from macro_data.oecd_eo import OECD_METHODOLOGY, oecd_lookup
from macro_data.imf import imf_code_for_country

IMF_METHODOLOGY = "IMF World Economic Outlook (SDMX / DataMapper)"


def projection_cutoff_year() -> int:
    return time.gmtime().tm_year - 1


def is_projection_year(year: int) -> bool:
    return year >= projection_cutoff_year()


def _imf_lookup(
    imf_data: dict[str, dict[int, float]],
    country: dict,
    year: int,
) -> float | None:
    code = imf_code_for_country(country)
    if not code:
        return None
    return (imf_data.get(code) or {}).get(year)


def resolve_forecast_value(
    country: dict,
    year: int,
    ind_key: str,
    *,
    imf_data: dict[str, dict[int, float]],
    oecd_data: dict[str, dict[int, float]],
    imf_indicator: str | None,
    apply_imf_scale,
) -> tuple[float | None, str | None, str | None]:
    """
    Pick IMF WEO or OECD EO for a projection / unreleased year.

    Rules:
    - Year beyond typical OECD annual horizon (>= current calendar year + 1): IMF only.
    - Otherwise: IMF if present, else OECD.
    - gdp_deflator / current_account: OECD preferred when IMF has no mapping.
    """
    imf_val = None
    if imf_indicator:
        raw = _imf_lookup(imf_data, country, year)
        if raw is not None:
            imf_val = apply_imf_scale(ind_key, imf_indicator, raw)

    oecd_val = oecd_lookup(oecd_data, country, year)

    horizon = time.gmtime().tm_year + 1
    if year >= horizon:
        if imf_val is not None:
            return imf_val, "IMF", IMF_METHODOLOGY
        return None, None, None

    if imf_val is not None:
        return imf_val, "IMF", IMF_METHODOLOGY
    if oecd_val is not None:
        return oecd_val, "OECD", OECD_METHODOLOGY
    return None, None, None


def projection_meta() -> dict[str, Any]:
    return {
        "horizonYear": PROJECTION_END_YEAR,
        "sources": [
            {
                "id": "IMF",
                "label": "IMF World Economic Outlook",
                "role": "Primary global forecasts (incl. forward years)",
            },
            {
                "id": "OECD",
                "label": "OECD Economic Outlook",
                "role": "Complement for unreleased data and IMF gaps (EO economies)",
            },
        ],
        "cutoffYear": projection_cutoff_year(),
    }