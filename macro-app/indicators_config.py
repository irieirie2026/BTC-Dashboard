"""
FRED series mappings for Macro Drivers.

Each indicator defines:
  - label: display name
  - unit: human-readable unit
  - transform: how to process the raw series (see fred_client.apply_transform)
  - countries: country name -> FRED series_id (None / missing key = not available)

Notes:
  - International coverage on FRED is uneven; China/India PMI and some policy rates
    may be absent or quarterly only.
  - CPI series are typically index levels — YoY % is computed in code.
  - GDP real series are often quarterly index levels — YoY % computed from levels.
"""

from __future__ import annotations

# Default sidebar selections
DEFAULT_COUNTRIES = [
    "United States",
    "Euro Area",
    "China",
    "Japan",
    "United Kingdom",
    "India",
]

COUNTRY_CODES = {
    "United States": "US",
    "Euro Area": "EA",
    "China": "CN",
    "Japan": "JP",
    "United Kingdom": "GB",
    "India": "IN",
}

# Indicator groups for filter checklists
INDICATOR_GROUPS = {
    "Growth": ["gdp_real", "industrial_production"],
    "Inflation": ["cpi", "core_cpi"],
    "Labor": ["unemployment"],
    "Policy & Rates": ["policy_rate", "yield_10y", "yield_curve"],
    "Leading": ["pmi_manufacturing"],
}

INDICATOR_CATALOG: dict[str, dict] = {
    # --- Growth ---
    "gdp_real": {
        "label": "Real GDP",
        "unit": "YoY %",
        "transform": "yoy_pct",
        "countries": {
            # Quarterly real GDP, SAAR index
            "United States": "GDPC1",
            # Euro area real GDP (quarterly)
            "Euro Area": "CLVMNACSCAB1GQEA19",
            # China lacks a standard monthly FRED real-GDP YoY; use industrial production proxy
            "China": None,
            "Japan": "JPNRGDPEXP",
            "United Kingdom": "GBRRGDPQPSMEI",
            "India": None,
        },
        "fallback_note": "China/India real GDP often unavailable on FRED at monthly frequency.",
    },
    "industrial_production": {
        "label": "Industrial Production",
        "unit": "YoY %",
        "transform": "yoy_pct",
        "countries": {
            "United States": "INDPRO",
            "Euro Area": "PRINTO01EZM661N",
            "China": "CHNPROINDMISMEI",
            "Japan": "JPNPROINDMISMEI",
            "United Kingdom": "GBRPROINDMISMEI",
            "India": "INDPROINDMISMEI",
        },
    },
    # --- Inflation ---
    "cpi": {
        "label": "CPI Inflation",
        "unit": "YoY %",
        "transform": "yoy_pct",
        "countries": {
            # US CPI-U All Items — compute YoY from index
            "United States": "CPIAUCSL",
            "Euro Area": "CP0000EZ19M086NEST",
            "China": "CHNCPIALLMINMEI",
            "Japan": "JPNCPIALLMINMEI",
            "United Kingdom": "GBRCPIALLMINMEI",
            "India": "INDCPICORAINMEI",
        },
    },
    "core_cpi": {
        "label": "Core CPI",
        "unit": "YoY %",
        "transform": "yoy_pct",
        "countries": {
            "United States": "CPILFESL",
            "Euro Area": "CP0000EZ19M057NEST",
            "China": None,
            "Japan": None,
            "United Kingdom": None,
            "India": None,
        },
    },
    # --- Labor ---
    "unemployment": {
        "label": "Unemployment Rate",
        "unit": "%",
        "transform": "level",
        "countries": {
            "United States": "UNRATE",
            "Euro Area": "LRUNTTTTEZM156S",
            "China": None,
            "Japan": "LRUN64TTJPM156S",
            "United Kingdom": "LRUNTTTTGBM156S",
            "India": None,
        },
    },
    # --- Policy & rates ---
    "policy_rate": {
        "label": "Policy Rate",
        "unit": "%",
        "transform": "level",
        "countries": {
            "United States": "FEDFUNDS",
            "Euro Area": "ECBDFR",
            "China": None,
            "Japan": "INTDSRJPN193N",
            "United Kingdom": "IUDSOIA",
            "India": None,
        },
        "fallback_note": "China/India policy rates may require alternate sources.",
    },
    "yield_10y": {
        "label": "10Y Government Yield",
        "unit": "%",
        "transform": "level",
        "countries": {
            "United States": "DGS10",
            "Euro Area": "IRLTLT01EZM156N",
            "China": None,
            "Japan": "IRLTLT01JPM156N",
            "United Kingdom": "IRLTLT01GBM156N",
            "India": None,
        },
    },
    "yield_curve": {
        "label": "10Y–2Y Yield Spread",
        "unit": "pp",
        "transform": "level",
        "countries": {
            # US-focused; T10Y2Y is the standard FRED curve proxy
            "United States": "T10Y2Y",
            "Euro Area": None,
            "China": None,
            "Japan": None,
            "United Kingdom": None,
            "India": None,
        },
    },
    # --- Leading ---
    "pmi_manufacturing": {
        "label": "Manufacturing PMI",
        "unit": "Index",
        "transform": "level",
        "countries": {
            # ISM Manufacturing PMI (US)
            "United States": "NAPM",
            "Euro Area": "EA19PMIM",
            "China": None,
            "Japan": "JPNPEM",
            "United Kingdom": "GBRPMIM",
            "India": None,
        },
        "fallback_note": (
            "Global PMI coverage on FRED is limited and may be revised/discontinued. "
            "Use as directional signal only."
        ),
    },
}

# US yield curve pillars for snapshot chart (tenor -> FRED id)
US_YIELD_CURVE_SERIES = {
    "3M": "DGS3MO",
    "2Y": "DGS2",
    "5Y": "DGS5",
    "10Y": "DGS10",
    "30Y": "DGS30",
}

# NBER recession shading (US)
US_RECESSION_SERIES = "USREC"

# US dashboard series for deep-dive panel
US_DASHBOARD_SERIES = {
    "gdp": "GDPC1",
    "cpi": "CPIAUCSL",
    "unemployment": "UNRATE",
}

DEFAULT_INDICATORS = [
    "gdp_real",
    "cpi",
    "unemployment",
    "policy_rate",
    "yield_10y",
    "yield_curve",
    "pmi_manufacturing",
]

PERIOD_OPTIONS = {
    "1Y": 365,
    "3Y": 365 * 3,
    "5Y": 365 * 5,
    "10Y": 365 * 10,
    "20Y": 365 * 20,
}