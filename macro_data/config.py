"""
Macro Drivers indicator catalog, regional mappings, and methodology metadata.
"""

from __future__ import annotations

HISTORY_START_YEAR = 2010
DEFAULT_YEAR = 2024
# Forward view: IMF WEO / extrapolated liquidity through end of this year.
PROJECTION_END_YEAR = 2026
PROJECTION_END_MONTH = "2026-12"


def data_years(*, start: int | None = None, end: int | None = None) -> list[int]:
    return list(range(start or HISTORY_START_YEAR, (end or PROJECTION_END_YEAR) + 1))

INDICATOR_TABS = {
    "growth": "Growth & Income",
    "prices": "Prices & Stability",
    "trade": "Trade & Investment",
    "labor": "Labor Market",
}

INDICATORS: dict[str, dict] = {
    "gdp_nominal": {
        "label": "GDP (current US$)",
        "unit": "USD",
        "wb_code": "NY.GDP.MKTP.CD",
        "imf_code": "NGDPD",
        "dbnomics": None,
        "tab": "growth",
        "format": "large_usd",
    },
    "gdp_per_capita": {
        "label": "GDP per capita (current US$)",
        "unit": "USD",
        "wb_code": "NY.GDP.PCAP.CD",
        "imf_code": "NGDPDPC",
        "dbnomics": None,
        "tab": "growth",
        "format": "usd",
    },
    "gdp_per_capita_ppp": {
        "label": "GDP per capita, PPP",
        "unit": "Intl $",
        "wb_code": "NY.GDP.PCAP.PP.CD",
        "imf_code": "PPPPC",
        "dbnomics": None,
        "tab": "growth",
        "format": "usd",
    },
    "gdp_growth": {
        "label": "GDP growth (annual %)",
        "unit": "%",
        "wb_code": "NY.GDP.MKTP.KD.ZG",
        "imf_code": "NGDP_RPCH",
        "dbnomics": None,
        "tab": "growth",
        "format": "pct",
    },
    "cpi_inflation": {
        "label": "CPI inflation (annual %)",
        "unit": "%",
        "wb_code": "FP.CPI.TOTL.ZG",
        "imf_code": "PCPIPCH",
        "dbnomics": None,
        "tab": "prices",
        "format": "pct",
    },
    "gdp_deflator": {
        "label": "GDP deflator inflation (annual %)",
        "unit": "%",
        "wb_code": "NY.GDP.DEFL.KD.ZG",
        "imf_code": None,
        "dbnomics": None,
        "tab": "prices",
        "format": "pct",
    },
    "trade_openness": {
        "label": "Trade (% of GDP)",
        "unit": "% GDP",
        "wb_code": "NE.TRD.GNFS.ZS",
        "imf_code": None,
        "dbnomics": None,
        "tab": "trade",
        "format": "pct",
    },
    "exports_gdp": {
        "label": "Exports (% of GDP)",
        "unit": "% GDP",
        "wb_code": "NE.EXP.GNFS.ZS",
        "imf_code": "BX_GDP",
        "dbnomics": None,
        "tab": "trade",
        "format": "pct",
    },
    "imports_gdp": {
        "label": "Imports (% of GDP)",
        "unit": "% GDP",
        "wb_code": "NE.IMP.GNFS.ZS",
        "imf_code": "BM_GDP",
        "dbnomics": None,
        "tab": "trade",
        "format": "pct",
    },
    "fdi_gdp": {
        "label": "FDI net inflows (% of GDP)",
        "unit": "% GDP",
        "wb_code": "BX.KLT.DINV.WD.GD.ZS",
        "imf_code": "BFD_GDP",
        "dbnomics": None,
        "tab": "trade",
        "format": "pct",
    },
    "current_account": {
        "label": "Current account balance (% of GDP)",
        "unit": "% GDP",
        "wb_code": "BN.CAB.XOKA.GD.ZS",
        "imf_code": "BCA_NGDPD",
        "dbnomics": None,
        "tab": "trade",
        "format": "pct",
    },
    "unemployment": {
        "label": "Unemployment (% of labor force)",
        "unit": "%",
        "wb_code": "SL.UEM.TOTL.ZS",
        "imf_code": "LUR",
        "dbnomics": None,
        "tab": "labor",
        "format": "pct",
    },
    "population": {
        "label": "Population, total",
        "unit": "",
        "wb_code": "SP.POP.TOTL",
        "imf_code": "LP",
        "dbnomics": None,
        "tab": "labor",
        "format": "large_int",
    },
}

INDICATOR_KEYS = list(INDICATORS.keys())

# Eurostat geo codes (2-letter or aggregate labels).
EUROSTAT_GEO_OVERRIDES: dict[str, str] = {
    "GR": "EL",  # Greece
}

EUROSTAT_AGGREGATE_MAP: dict[str, str] = {
    "EUU": "EU27_2020",
    "EMU": "EA20",
    "XC": "EA20",
    "EURO": "EA20",
}

# WB regional aggregates → composite from member countries when direct series missing.
AGGREGATE_COMPOSITE_REGIONS: dict[str, list[str]] = {
    "ECS": ["Europe & Central Asia"],
    "EAS": ["East Asia & Pacific"],
    "LCN": ["Latin America & Caribbean"],
    "MEA": ["Middle East, North Africa, Afghanistan & Pakistan"],
    "NAC": ["North America"],
    "SAS": ["South Asia"],
    "SSA": ["Sub-Saharan Africa"],
    "AFR": ["Sub-Saharan Africa", "Middle East, North Africa, Afghanistan & Pakistan"],
}

# GDP-weighted for rates; summed for levels.
RATE_INDICATORS = frozenset(
    {
        "gdp_growth",
        "cpi_inflation",
        "gdp_deflator",
        "trade_openness",
        "exports_gdp",
        "imports_gdp",
        "fdi_gdp",
        "current_account",
        "unemployment",
    }
)

WB_IMF_AGGREGATE_MAP: dict[str, str] = {
    "WLD": "WE",
    "1W": "WE",
    "EUU": "EU",
    "EMU": "EU",
    "XC": "EU",
    "SSA": "SSA",
    "AFE": "SSA",
    "AFW": "SSA",
    "SAS": "SAS",
    "EAS": "DA",
    "ECS": "EUR",
    "LCN": "WHQ",
    "MEA": "MEC",
    "NAC": "NAC",
    "AFR": "AFR",
    "ARB": "MEC",
    "CEB": "CEE",
    "ADVEC": "ADVEC",
    "EURO": "EU",
}

FEATURED_AGGREGATES = frozenset(
    {
        "WLD",
        "EUU",
        "EMU",
        "SSA",
        "EAS",
        "ECS",
        "LCN",
        "MEA",
        "NAC",
        "SAS",
        "AFR",
        "ARB",
        "CEB",
    }
)

METHODOLOGY = {
    "hierarchy": [
        "World Bank WDI (primary)",
        "IMF World Economic Outlook (projection / unreleased years)",
        "OECD Economic Outlook (complement where IMF missing)",
        "Eurostat (EU / euro area — recent-year gap fill)",
        "DBnomics (when configured for an indicator)",
        "GDP-weighted regional composite (labeled Proxy for aggregates)",
    ],
    "primary": "World Bank World Development Indicators (WDI) API v2",
    "fallback": "IMF World Economic Outlook (SDMX 3.0 CSV API, DataMapper fallback)",
    "oecd": "OECD Economic Outlook via SDMX (DSD_EO@DF_EO)",
    "eurostat": "Eurostat JSON API (nama_10_gdp, prc_hicp_aind, une_rt_a)",
    "tertiary": "DBnomics public API (indicator-specific)",
    "proxy": "GDP-weighted regional composites when official aggregate series is unavailable",
    "rule": "Each cell uses the highest-priority source with data; source badge is always shown.",
    "projection": (
        f"Forecast horizon through {PROJECTION_END_YEAR}: IMF WEO is the primary global forecast; "
        "OECD Economic Outlook fills gaps (e.g. GDP deflator, current account) and unreleased national data; "
        "liquidity stock extrapolates with IMF/OECD real GDP growth; monthly liquidity holds latest 3m SAR flat."
    ),
}