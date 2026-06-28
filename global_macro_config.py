"""
Global Macro Dashboard — indicator catalog and country mappings.
"""

from __future__ import annotations

HISTORY_START_YEAR = 2010
DEFAULT_YEAR = 2024  # fallback when coverage scan finds no better year

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
        "tab": "growth",
        "format": "large_usd",
    },
    "gdp_per_capita": {
        "label": "GDP per capita (current US$)",
        "unit": "USD",
        "wb_code": "NY.GDP.PCAP.CD",
        "imf_code": "NGDPDPC",
        "tab": "growth",
        "format": "usd",
    },
    "gdp_per_capita_ppp": {
        "label": "GDP per capita, PPP",
        "unit": "Intl $",
        "wb_code": "NY.GDP.PCAP.PP.CD",
        "imf_code": "PPPPC",
        "tab": "growth",
        "format": "usd",
    },
    "gdp_growth": {
        "label": "GDP growth (annual %)",
        "unit": "%",
        "wb_code": "NY.GDP.MKTP.KD.ZG",
        "imf_code": "NGDP_RPCH",
        "tab": "growth",
        "format": "pct",
    },
    "cpi_inflation": {
        "label": "CPI inflation (annual %)",
        "unit": "%",
        "wb_code": "FP.CPI.TOTL.ZG",
        "imf_code": "PCPIPCH",
        "tab": "prices",
        "format": "pct",
    },
    "gdp_deflator": {
        "label": "GDP deflator inflation (annual %)",
        "unit": "%",
        "wb_code": "NY.GDP.DEFL.KD.ZG",
        "imf_code": None,
        "tab": "prices",
        "format": "pct",
    },
    "exports_gdp": {
        "label": "Exports (% of GDP)",
        "unit": "% GDP",
        "wb_code": "NE.EXP.GNFS.ZS",
        "imf_code": "BX_GDP",
        "tab": "trade",
        "format": "pct",
    },
    "imports_gdp": {
        "label": "Imports (% of GDP)",
        "unit": "% GDP",
        "wb_code": "NE.IMP.GNFS.ZS",
        "imf_code": "BM_GDP",
        "tab": "trade",
        "format": "pct",
    },
    "fdi_gdp": {
        "label": "FDI net inflows (% of GDP)",
        "unit": "% GDP",
        "wb_code": "BX.KLT.DINV.WD.GD.ZS",
        "imf_code": "BFD_GDP",
        "tab": "trade",
        "format": "pct",
    },
    "current_account": {
        "label": "Current account balance (% of GDP)",
        "unit": "% GDP",
        "wb_code": "BN.CAB.XOKA.GD.ZS",
        "imf_code": "BCA_NGDPD",
        "tab": "trade",
        "format": "pct",
    },
    "unemployment": {
        "label": "Unemployment (% of labor force)",
        "unit": "%",
        "wb_code": "SL.UEM.TOTL.ZS",
        "imf_code": "LUR",
        "tab": "labor",
        "format": "pct",
    },
    "population": {
        "label": "Population, total",
        "unit": "",
        "wb_code": "SP.POP.TOTL",
        "imf_code": "LP",
        "tab": "labor",
        "format": "large_int",
    },
}

INDICATOR_KEYS = list(INDICATORS.keys())

# World Bank aggregate id / iso3 -> IMF DataMapper code (fallback only).
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

# Featured regional aggregates shown at top of aggregate filter.
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