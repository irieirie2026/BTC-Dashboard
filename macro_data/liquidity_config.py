"""
Liquidity proxy configuration — 3-component model per entity.
"""

from __future__ import annotations

from macro_data.config import HISTORY_START_YEAR

LIQUIDITY_START_YEAR = HISTORY_START_YEAR

# Component definitions (WB primary codes).
COMPONENTS = {
    "fx_reserves": {
        "key": "fx_reserves",
        "label": "FX Reserves (ex-gold)",
        "wb_total": "FI.RES.TOTL.CD",
        "wb_gold": "FI.RES.XGLD.CD",
        "unit": "USD",
        "format": "large_usd",
    },
    "broad_money": {
        "key": "broad_money",
        "label": "Broad Money Supply",
        "wb_level_lcu": "FM.LBL.BMNY.CN",
        "wb_gdp_ratio": "FM.LBL.BMNY.GD.ZS",
        "wb_gdp_usd": "NY.GDP.MKTP.CD",
        "wb_fx": "PA.NUS.FCRF",
        "unit": "USD",
        "format": "large_usd",
    },
    "cb_balance_sheet": {
        "key": "cb_balance_sheet",
        "label": "Central Bank Balance Sheet",
        "unit": "USD",
        "format": "large_usd",
    },
}

# DBnomics / FRED annualized central-bank assets (USD millions → multiply by 1e6).
CB_DBNOMICS: dict[str, dict] = {
    "US": {
        "provider": "FRED",
        "dataset": "FRB_H6",
        "series": "WALCL",
        "scale": 1e6,
        "label": "Federal Reserve total assets",
    },
    "JP": {
        "provider": "IMF",
        "dataset": "IFS",
        "series": "JPN.BCA_BP6_USD",
        "scale": 1e6,
        "label": "BOJ balance sheet (IMF IFS)",
    },
    "GB": {
        "provider": "IMF",
        "dataset": "IFS",
        "series": "GBR.BCA_BP6_USD",
        "scale": 1e6,
        "label": "Bank of England balance sheet (IMF IFS)",
    },
    "DE": {
        "provider": "IMF",
        "dataset": "IFS",
        "series": "DEU.BCA_BP6_USD",
        "scale": 1e6,
        "label": "Bundesbank balance sheet (IMF IFS)",
    },
    "CN": {
        "provider": "IMF",
        "dataset": "IFS",
        "series": "CHN.BCA_BP6_USD",
        "scale": 1e6,
        "label": "PBOC balance sheet (IMF IFS)",
    },
    "CA": {
        "provider": "IMF",
        "dataset": "IFS",
        "series": "CAN.BCA_BP6_USD",
        "scale": 1e6,
        "label": "Bank of Canada balance sheet (IMF IFS)",
    },
    "AU": {
        "provider": "IMF",
        "dataset": "IFS",
        "series": "AUS.BCA_BP6_USD",
        "scale": 1e6,
        "label": "RBA balance sheet (IMF IFS)",
    },
    "CH": {
        "provider": "IMF",
        "dataset": "IFS",
        "series": "CHE.BCA_BP6_USD",
        "scale": 1e6,
        "label": "SNB balance sheet (IMF IFS)",
    },
    "IN": {
        "provider": "IMF",
        "dataset": "IFS",
        "series": "IND.BCA_BP6_USD",
        "scale": 1e6,
        "label": "RBI balance sheet (IMF IFS)",
    },
    "BR": {
        "provider": "IMF",
        "dataset": "IFS",
        "series": "BRA.BCA_BP6_USD",
        "scale": 1e6,
        "label": "BCB balance sheet (IMF IFS)",
    },
    "KR": {
        "provider": "IMF",
        "dataset": "IFS",
        "series": "KOR.BCA_BP6_USD",
        "scale": 1e6,
        "label": "BOK balance sheet (IMF IFS)",
    },
    "FR": {
        "provider": "IMF",
        "dataset": "IFS",
        "series": "FRA.BCA_BP6_USD",
        "scale": 1e6,
        "label": "Banque de France balance sheet (IMF IFS)",
    },
    "IT": {
        "provider": "IMF",
        "dataset": "IFS",
        "series": "ITA.BCA_BP6_USD",
        "scale": 1e6,
        "label": "Banca d'Italia balance sheet (IMF IFS)",
    },
    "MX": {
        "provider": "IMF",
        "dataset": "IFS",
        "series": "MEX.BCA_BP6_USD",
        "scale": 1e6,
        "label": "Banco de México balance sheet (IMF IFS)",
    },
}

# IMF IFS via DBnomics — keys match country id, listId, or iso3 (see imf_ifs._country_keys).
# Series use IMF IFS annual USD codes (values in millions USD unless scale overrides).
_IFS_CB = "BCA_BP6_USD"
_IFS_BM = "FMB_BP6_USD"
_IFS_FX = "RAF_BP6_USD"
_IFS_SCALE = 1e6

def _ifs_entry(iso3: str, *, aliases: list[str] | None = None) -> dict:
    entry = {"series": f"{iso3}.{_IFS_CB}", "scale": _IFS_SCALE}
    if aliases:
        entry["aliases"] = aliases
    return entry

def _ifs_bm(iso3: str, *, aliases: list[str] | None = None) -> dict:
    entry = {"series": f"{iso3}.{_IFS_BM}", "scale": _IFS_SCALE}
    if aliases:
        entry["aliases"] = aliases
    return entry

def _ifs_fx(iso3: str, *, aliases: list[str] | None = None) -> dict:
    entry = {"series": f"{iso3}.{_IFS_FX}", "scale": _IFS_SCALE}
    if aliases:
        entry["aliases"] = aliases
    return entry

IFS_SERIES: dict[str, dict[str, dict]] = {
    "cb_balance_sheet": {
        "US": _ifs_entry("USA", aliases=["USA"]),
        "GB": _ifs_entry("GBR", aliases=["GB"]),
        "DE": _ifs_entry("DEU", aliases=["DE"]),
        "CN": _ifs_entry("CHN", aliases=["CN"]),
        "JP": _ifs_entry("JPN", aliases=["JP"]),
        "CA": _ifs_entry("CAN", aliases=["CA"]),
        "AU": _ifs_entry("AUS", aliases=["AU"]),
        "CH": _ifs_entry("CHE", aliases=["CH"]),
        "IN": _ifs_entry("IND", aliases=["IN"]),
        "BR": _ifs_entry("BRA", aliases=["BR"]),
        "KR": _ifs_entry("KOR", aliases=["KR"]),
        "FR": _ifs_entry("FRA", aliases=["FR"]),
        "IT": _ifs_entry("ITA", aliases=["IT"]),
        "MX": _ifs_entry("MEX", aliases=["MX"]),
        "ES": _ifs_entry("ESP", aliases=["ES"]),
        "NL": _ifs_entry("NLD", aliases=["NL"]),
        "SE": _ifs_entry("SWE", aliases=["SE"]),
        "NO": _ifs_entry("NOR", aliases=["NO"]),
        "SG": _ifs_entry("SGP", aliases=["SG"]),
        "ZA": _ifs_entry("ZAF", aliases=["ZA"]),
        "RU": _ifs_entry("RUS", aliases=["RU"]),
        "TR": _ifs_entry("TUR", aliases=["TR"]),
        "SA": _ifs_entry("SAU", aliases=["SA"]),
        "ID": _ifs_entry("IDN", aliases=["ID"]),
    },
    "broad_money": {
        "US": _ifs_bm("USA", aliases=["USA"]),
        "GB": _ifs_bm("GBR", aliases=["GB"]),
        "DE": _ifs_bm("DEU", aliases=["DE"]),
        "CN": _ifs_bm("CHN", aliases=["CN"]),
        "JP": _ifs_bm("JPN", aliases=["JP"]),
        "CA": _ifs_bm("CAN", aliases=["CA"]),
        "AU": _ifs_bm("AUS", aliases=["AU"]),
        "CH": _ifs_bm("CHE", aliases=["CH"]),
        "IN": _ifs_bm("IND", aliases=["IN"]),
        "BR": _ifs_bm("BRA", aliases=["BR"]),
        "KR": _ifs_bm("KOR", aliases=["KR"]),
        "FR": _ifs_bm("FRA", aliases=["FR"]),
        "IT": _ifs_bm("ITA", aliases=["IT"]),
        "MX": _ifs_bm("MEX", aliases=["MX"]),
        "EMU": _ifs_bm("EUR", aliases=["XC"]),
    },
    "fx_reserves": {
        "US": _ifs_fx("USA", aliases=["USA"]),
        "GB": _ifs_fx("GBR", aliases=["GB"]),
        "DE": _ifs_fx("DEU", aliases=["DE"]),
        "CN": _ifs_fx("CHN", aliases=["CN"]),
        "JP": _ifs_fx("JPN", aliases=["JP"]),
        "CA": _ifs_fx("CAN", aliases=["CA"]),
        "AU": _ifs_fx("AUS", aliases=["AU"]),
        "CH": _ifs_fx("CHE", aliases=["CH"]),
        "IN": _ifs_fx("IND", aliases=["IN"]),
        "BR": _ifs_fx("BRA", aliases=["BR"]),
        "KR": _ifs_fx("KOR", aliases=["KR"]),
        "FR": _ifs_fx("FRA", aliases=["FR"]),
        "IT": _ifs_fx("ITA", aliases=["IT"]),
        "MX": _ifs_fx("MEX", aliases=["MX"]),
        "SA": _ifs_fx("SAU", aliases=["SA"]),
        "RU": _ifs_fx("RUS", aliases=["RU"]),
        "TR": _ifs_fx("TUR", aliases=["TR"]),
    },
}

# Proxy CB BS = broad_money * ratio when no direct series.
CB_PROXY_RATIO = 0.12
CB_PROXY_METHODOLOGY = (
    "Constructed proxy: 12% of broad money supply when central bank balance sheet "
    "data is unavailable from DBnomics/IMF."
)

FX_RESERVES_PROXY_METHODOLOGY = (
    "Total reserves used when gold reserve breakdown is unavailable; "
    "gold component subtracted when WB FI.RES.XGLD.CD is present."
)

BROAD_MONEY_PROXY_METHODOLOGY = (
    "Broad money estimated as GDP (current US$) × broad money (% of GDP) "
    "when local-currency level and FX rate are unavailable."
)

# Euro-area members — used when WB broad-money series are missing (common for EA economies).
EURO_AREA_COUNTRY_IDS = frozenset(
    {
        "AT",
        "BE",
        "CY",
        "DE",
        "EE",
        "ES",
        "FI",
        "FR",
        "GR",
        "HR",
        "IE",
        "IT",
        "LT",
        "LU",
        "LV",
        "MT",
        "NL",
        "PT",
        "SI",
        "SK",
    }
)

EURO_AREA_AGGREGATE_IDS = frozenset({"EMU", "XC", "EURO"})

EURO_BM_FRED = "MABMM301EZM189N"
EURO_CB_FRED = "ECBASSETSW"
EURO_FX_FRED = "EXUSEU"
EURO_CB_FRED_SCALE = 1e6

EURO_BM_METHODOLOGY = (
    "Euro-area M3 (FRED OECD) allocated by country share of euro-area nominal GDP (WB WDI). "
    "When FRED M3 ends, forward years use the trailing average M3 growth rate."
)

EURO_CB_METHODOLOGY = (
    "ECB total assets (FRED) allocated by country share of euro-area nominal GDP (WB WDI)."
)

# Country-specific OECD/FRED broad money when WB has no money series (e.g. Switzerland).
FRED_COUNTRY_BM: dict[str, dict] = {
    "CH": {
        "series": "MABMM301CHM189N",
        "currency": "CHF",
        "fx_series": "EXSZUS",
        "fx_divide": True,
        "methodology": (
            "Broad money M3 (FRED OECD, CHF) converted to USD via USD/CHF. "
            "Forward years use trailing average M3 growth when FRED ends."
        ),
    },
}

# FRED monthly feeds for true 3m SAR (seasonally adjusted where noted by FRED).
MONTHLY_LIQUIDITY_FEEDS: dict[str, dict] = {
    "US": {
        "label": "United States",
        "country_id": "US",
        "method": "FRED SA monthly + weekly Fed assets",
        "components": {
            "cb_balance_sheet": {
                "fred_id": "WALCL",
                "freq": "weekly",
                "scale": 1e6,
                "currency": "USD",
                "source": "FRED",
            },
            "broad_money": {
                "fred_id": "M2SL",
                "freq": "monthly",
                "scale": 1e9,
                "currency": "USD",
                "source": "FRED",
            },
            "fx_reserves": {
                "from_annual": True,
                "source": "WB",
            },
        },
    },
    "JP": {
        "label": "Japan",
        "country_id": "JP",
        "method": "FRED BOJ assets + M2 converted via USD/JPY",
        "components": {
            "cb_balance_sheet": {
                "fred_id": "JPNASSETS",
                "freq": "monthly",
                "scale": 1e8,
                "currency": "JPY",
                "fx_series": "EXJPUS",
                "source": "FRED",
            },
            "broad_money": {
                "fred_id": "MYAGM2JPM189N",
                "freq": "monthly",
                "scale": 1.0,
                "currency": "JPY",
                "fx_series": "EXJPUS",
                "source": "FRED",
            },
            "fx_reserves": {
                "from_annual": True,
                "source": "WB",
            },
        },
    },
    "EMU": {
        "label": "Euro area",
        "country_id": "EMU",
        "method": "FRED ECB assets + euro-area M2 converted via USD/EUR",
        "components": {
            "cb_balance_sheet": {
                "fred_id": "ECBASSETSW",
                "freq": "weekly",
                "scale": 1e6,
                "currency": "EUR",
                "fx_series": "EXUSEU",
                "source": "FRED",
            },
            "broad_money": {
                "fred_id": "MABMM301EZM189N",
                "freq": "monthly",
                "scale": 1.0,
                "currency": "EUR",
                "fx_series": "EXUSEU",
                "source": "FRED",
            },
            "fx_reserves": {
                "from_annual": True,
                "source": "WB",
            },
        },
    },
}

LIQUIDITY_METHODOLOGY = {
    "formula": "Liquidity Proxy = CB Balance Sheet + Broad Money + FX Reserves (ex-gold)",
    "hierarchy": [
        "World Bank WDI (reserves, money, GDP, FX)",
        "IMF International Financial Statistics via DBnomics (CB, money, reserves)",
        "DBnomics direct feeds (FRED WALCL, IMF IFS central bank assets)",
        "Euro-area FRED allocation (M3 + ECB assets by GDP share when WB money is missing)",
        "Constructed proxy (labeled Proxy with methodology)",
    ],
    "yoy": "Year-over-year % change in the liquidity proxy (annual WDI frequency).",
    "momentum": "Fallback 3m momentum when monthly feeds unavailable: annualized change vs prior year.",
    "momentumMonthly": (
        "True 3-month SAAR on monthly FRED feeds: ((Lₜ / Lₜ₋₃)⁴ − 1) × 100 on the monthly liquidity proxy. "
        "US/Japan/Euro area use CB + broad money (SA where provided by FRED); FX reserves use annual WB forward-filled. "
        "Global/Advanced views sum US + Japan + Euro area monthly blocks."
    ),
    "marketOverlay": "Optional real-time layer: TLT, HYG, LQD, VIX via Yahoo Finance (delayed).",
    "creditGap": (
        "BIS credit-to-GDP gap (private non-financial sector): actual ratio minus HP-filter trend. "
        "Complements the liquidity stock proxy with private credit cycle pressure. "
        "Global/Advanced views use an unweighted composite of major BIS economies."
    ),
}

# Regional / scope entities for drill-down.
LIQUIDITY_ENTITIES: dict[str, dict] = {
    "WLD": {
        "label": "Global",
        "type": "wb_aggregate",
        "wb_ids": ["1W", "WLD"],
    },
    "ADV": {
        "label": "Advanced Economies",
        "type": "income_filter",
        "incomes": ["High income"],
        "exclude_aggregates": True,
    },
    "EM": {
        "label": "Emerging Markets",
        "type": "income_filter",
        "incomes": ["Low income", "Lower middle income", "Upper middle income"],
        "exclude_aggregates": True,
    },
    "EAS": {
        "label": "East Asia & Pacific",
        "type": "region_filter",
        "regions": ["East Asia & Pacific"],
        "exclude_aggregates": True,
    },
    "ECS": {
        "label": "Europe & Central Asia",
        "type": "region_filter",
        "regions": ["Europe & Central Asia"],
        "exclude_aggregates": True,
    },
    "NAC": {
        "label": "North America",
        "type": "region_filter",
        "regions": ["North America"],
        "exclude_aggregates": True,
    },
}

# ISO2 / WB listId codes — resolved at runtime (e.g. EMU → Euro area id XC).
FEATURED_LIQUIDITY_COUNTRIES = [
    # G20 & largest economies
    "US", "CN", "JP", "DE", "IN", "GB", "FR", "IT", "BR", "CA", "KR", "RU", "AU", "MX", "ID", "TR", "SA", "ZA", "AR",
    "EMU",
    # Europe
    "ES", "NL", "CH", "PL", "SE", "BE", "AT", "NO", "IE", "DK", "FI", "PT", "CZ", "RO", "HU", "GR", "UA",
    "SK", "BG", "HR", "RS", "LU", "IS",
    # Asia–Pacific
    "SG", "MY", "TH", "PH", "VN", "HK", "NZ", "PK", "BD", "KZ", "LK", "KH", "MM",
    # Middle East & North Africa
    "AE", "IL", "EG", "QA", "KW", "BH", "OM", "MA", "DZ", "TN", "LB", "JO", "IR",
    # Sub-Saharan Africa
    "NG", "KE", "GH", "ET", "SN", "AO",
    # Americas
    "CL", "CO", "PE", "VE", "EC", "UY",
]

ENTITY_ORDER = ["WLD", "ADV", "EM", "EAS", "ECS", "NAC"] + FEATURED_LIQUIDITY_COUNTRIES