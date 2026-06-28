"""
World Bank WDI mappings for Macro Drivers.

Indicator codes: https://data.worldbank.org/indicator
Country codes: ISO2 or World Bank aggregates (EMU = Euro area).
"""

from __future__ import annotations

DEFAULT_COUNTRIES = [
    "United States",
    "Euro Area",
    "China",
    "Japan",
    "United Kingdom",
    "India",
    "Germany",
    "France",
    "Brazil",
    "Canada",
    "Australia",
    "South Korea",
    "Mexico",
    "Indonesia",
    "Saudi Arabia",
]

# Dashboard label -> World Bank API country code
WB_COUNTRY_CODES: dict[str, str] = {
    "United States": "US",
    "Euro Area": "EMU",
    "China": "CN",
    "Japan": "JP",
    "United Kingdom": "GB",
    "India": "IN",
    "Germany": "DE",
    "France": "FR",
    "Brazil": "BR",
    "Canada": "CA",
    "Australia": "AU",
    "South Korea": "KR",
    "Mexico": "MX",
    "Indonesia": "ID",
    "Saudi Arabia": "SA",
    "South Africa": "ZA",
    "Turkey": "TR",
    "Russia": "RU",
    "Italy": "IT",
    "Spain": "ES",
    "Netherlands": "NL",
    "Switzerland": "CH",
    "Poland": "PL",
    "Argentina": "AR",
    "Nigeria": "NG",
    "Thailand": "TH",
    "Vietnam": "VN",
    "Malaysia": "MY",
    "Philippines": "PH",
    "Singapore": "SG",
    "United Arab Emirates": "AE",
    "Belgium": "BE",
    "Austria": "AT",
    "Portugal": "PT",
    "Ireland": "IE",
    "Finland": "FI",
    "Greece": "GR",
}

EURO_AREA_LABEL = "Euro Area"

# Major euro members used to build Euro Area composites when EMU aggregate is empty in WDI.
EURO_AREA_MEMBERS = [
    "Germany",
    "France",
    "Italy",
    "Spain",
    "Netherlands",
    "Belgium",
    "Austria",
    "Portugal",
    "Ireland",
    "Finland",
    "Greece",
]

EURO_AREA_WEIGHT_INDICATOR = "NY.GDP.MKTP.CD"

EURO_AREA_COMPOSITE_INDICATORS = frozenset(
    {
        "cpi",
        "lending_rate",
        "real_interest_rate",
        "interest_spread",
        "current_account",
        "government_debt",
    }
)

# World Bank response country id -> dashboard label
WB_COUNTRY_LABELS: dict[str, str] = {
    code: label for label, code in WB_COUNTRY_CODES.items()
}
WB_COUNTRY_LABELS["XC"] = "Euro Area"
WB_COUNTRY_LABELS["EU"] = "European Union"

COUNTRY_CODES = {label: code for label, code in WB_COUNTRY_CODES.items()}

INDICATOR_GROUPS = {
    "Growth": ["gdp_real", "manufacturing_growth", "investment_gdp"],
    "Inflation": ["cpi", "gdp_deflator"],
    "Labor": ["unemployment"],
    "Rates & Credit": ["lending_rate", "real_interest_rate", "interest_spread"],
    "External & Fiscal": ["current_account", "government_debt", "trade_openness", "fdi_inflows"],
}

INDICATOR_CATALOG: dict[str, dict] = {
    "gdp_real": {
        "label": "Real GDP Growth",
        "unit": "YoY %",
        "transform": "growth",
        "wb_code": "NY.GDP.MKTP.KD.ZG",
        "fallback_note": "Annual real GDP growth from World Development Indicators.",
    },
    "cpi": {
        "label": "CPI Inflation",
        "unit": "YoY %",
        "transform": "growth",
        "wb_code": "FP.CPI.TOTL.ZG",
        "euro_area_composite": True,
    },
    "gdp_deflator": {
        "label": "GDP Deflator Inflation",
        "unit": "YoY %",
        "transform": "growth",
        "wb_code": "NY.GDP.DEFL.KD.ZG",
        "fallback_note": "Broad price index alternative where CPI is unavailable.",
    },
    "unemployment": {
        "label": "Unemployment Rate",
        "unit": "%",
        "transform": "level",
        "wb_code": "SL.UEM.TOTL.ZS",
        "fallback_note": "ILO-modeled unemployment; annual frequency.",
    },
    "lending_rate": {
        "label": "Lending Interest Rate",
        "unit": "%",
        "transform": "level",
        "wb_code": "FR.INR.LEND",
        "euro_area_composite": True,
        "fallback_note": "Bank lending rate — proxy for policy stance where no policy rate exists.",
    },
    "real_interest_rate": {
        "label": "Real Interest Rate",
        "unit": "%",
        "transform": "level",
        "wb_code": "FR.INR.RINR",
        "euro_area_composite": True,
        "fallback_note": "Lending rate adjusted for inflation.",
    },
    "interest_spread": {
        "label": "Lending–Deposit Spread",
        "unit": "pp",
        "transform": "level",
        "wb_code": "FR.INR.LNDP",
        "fallback_wb_code": "FR.INR.RISK",
        "euro_area_composite": True,
        "fallback_note": (
            "Lending minus deposit spread (FR.INR.LNDP). "
            "US and some peers use risk premium on lending (vs T-bill) when spread is unavailable."
        ),
    },
    "manufacturing_growth": {
        "label": "Manufacturing Value Added",
        "unit": "YoY %",
        "transform": "growth",
        "wb_code": "NV.IND.MANF.KD.ZG",
        "fallback_wb_code": "NV.IND.MANF.ZS",
        "fallback_transform": "level",
        "fallback_unit": "% GDP",
        "fallback_note": (
            "Annual manufacturing output growth. "
            "Where growth is unavailable (e.g. US), shows manufacturing value added as % of GDP."
        ),
    },
    "investment_gdp": {
        "label": "Gross Capital Formation",
        "unit": "% GDP",
        "transform": "level",
        "wb_code": "NE.GDI.TOTL.ZS",
    },
    "current_account": {
        "label": "Current Account Balance",
        "unit": "% GDP",
        "transform": "level",
        "wb_code": "BN.CAB.XOKA.GD.ZS",
        "euro_area_composite": True,
    },
    "government_debt": {
        "label": "Government Debt",
        "unit": "% GDP",
        "transform": "level",
        "wb_code": "GC.DOD.TOTL.GD.ZS",
        "euro_area_composite": True,
        "fallback_note": (
            "Central government debt (% GDP). "
            "Euro Area uses GDP-weighted member composite; WDI coverage is sparse for several members."
        ),
    },
    "trade_openness": {
        "label": "Trade (% of GDP)",
        "unit": "% GDP",
        "transform": "level",
        "wb_code": "NE.TRD.GNFS.ZS",
    },
    "fdi_inflows": {
        "label": "FDI Net Inflows",
        "unit": "% GDP",
        "transform": "level",
        "wb_code": "BX.KLT.DINV.WD.GD.ZS",
    },
}

US_DASHBOARD_INDICATORS = {
    "gdp": "gdp_real",
    "cpi": "cpi",
    "unemployment": "unemployment",
}

LEADING_INDICATORS = [
    "manufacturing_growth",
    "trade_openness",
    "current_account",
    "investment_gdp",
]

DEFAULT_INDICATORS = [
    "gdp_real",
    "cpi",
    "unemployment",
    "lending_rate",
    "real_interest_rate",
    "interest_spread",
    "manufacturing_growth",
    "current_account",
    "government_debt",
]

PERIOD_OPTIONS = {
    "1Y": 365,
    "3Y": 365 * 3,
    "5Y": 365 * 5,
    "10Y": 365 * 10,
    "20Y": 365 * 20,
}