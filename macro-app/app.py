#!/usr/bin/env python3
"""
Macro Drivers Dashboard — Dash app with FRED macro data.

requirements.txt:
  dash>=2.14.0
  dash-bootstrap-components>=1.5.0
  plotly>=5.18.0
  pandas>=2.0.0
  numpy>=1.24.0
  requests>=2.31.0
  yfinance>=0.2.40

Run locally:
  cd macro-app && pip install -r requirements.txt && python app.py

Deploy (gunicorn):
  gunicorn app:server -b 0.0.0.0:8050 --workers 2

Folder structure:
  macro-app/
    app.py                 # layout + callbacks (this file)
    indicators_config.py   # FRED series mappings
    fred_client.py         # API client + caching
    portfolio.py           # cross-tab portfolio tracker
    assets/style.css       # dark theme overrides
    requirements.txt

Get a free FRED API key:
  https://fred.stlouisfed.org/docs/api/api_key.html
  → Create account → My Account → API Keys → request key (instant).
"""

from __future__ import annotations

import json
from datetime import datetime

import dash
import dash_bootstrap_components as dbc
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from dash import Input, Output, State, callback, dcc, html, no_update
from plotly.subplots import make_subplots

from fred_client import (
    apply_transform,
    classify_regime,
    clear_cache,
    fetch_indicator_panel,
    fetch_multi_country_series,
    fetch_recession_series,
    fetch_series,
    fetch_us_yield_curve,
)
from indicators_config import (
    DEFAULT_COUNTRIES,
    DEFAULT_INDICATORS,
    INDICATOR_CATALOG,
    INDICATOR_GROUPS,
    PERIOD_OPTIONS,
    US_DASHBOARD_SERIES,
)
from portfolio import empty_portfolio, normalize_holdings, portfolio_summary

# ---------------------------------------------------------------------------
# App bootstrap — dark Bootstrap theme + custom CSS from assets/
# ---------------------------------------------------------------------------

app = dash.Dash(
    __name__,
    external_stylesheets=[dbc.themes.CYBORG, dbc.icons.BOOTSTRAP],
    suppress_callback_exceptions=True,
    title="Macro Drivers",
)
server = app.server  # gunicorn entrypoint: app:server

DEFAULT_COMMENTARY = """# Macro Outlook — {date}

## Base case
- Growth:
- Inflation:
- Policy:

## Key risks
- Upside:
- Downside:

## Equity market implications
- Earnings / multiples:
- Sector rotation:
- Geopolitical / FX:

## Personal notes
(Add your forward view here.)
"""


def _fmt(v, digits=2, suffix=""):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "—"
    return f"{v:.{digits}f}{suffix}"


def _change_color(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "var(--muted)"
    return "var(--positive)" if v >= 0 else "var(--negative)"


def _sparkline_fig(values: list, dates: list | None = None) -> go.Figure:
    fig = go.Figure(
        go.Scatter(
            x=list(range(len(values))) if not dates else dates,
            y=values,
            mode="lines",
            line=dict(color="#3b82f6", width=1.5),
            fill="tozeroy",
            fillcolor="rgba(59, 130, 246, 0.15)",
        )
    )
    fig.update_layout(
        margin=dict(l=4, r=4, t=4, b=4),
        height=40,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        xaxis=dict(visible=False),
        yaxis=dict(visible=False),
        showlegend=False,
    )
    return fig


def _build_snapshot_table(rows: list[dict]) -> list:
    """Render snapshot as Bootstrap rows with sparklines."""
    if not rows:
        return [html.P("No data — enter FRED API key and click Refresh.", className="text-muted")]

    header = dbc.Row(
        [
            dbc.Col(html.Strong("Country"), width=2),
            dbc.Col(html.Strong("Indicator"), width=3),
            dbc.Col(html.Strong("Latest"), width=2),
            dbc.Col(html.Strong("Δ YoY"), width=1),
            dbc.Col(html.Strong("Δ MoM"), width=1),
            dbc.Col(html.Strong("Trend"), width=3),
        ],
        className="border-bottom pb-2 mb-2 text-muted small",
    )
    body = [header]

    for r in rows:
        if r.get("missing"):
            val = html.Span("N/A", className="text-muted")
            spark = html.Span("—", className="text-muted")
        else:
            val = html.Span(
                f"{_fmt(r.get('value'))} {r.get('unit', '')}",
                style={"color": _change_color(r.get("yoy"))},
            )
            spark = (
                dcc.Graph(
                    figure=_sparkline_fig(r.get("sparkline") or [], r.get("spark_dates")),
                    config={"displayModeBar": False},
                    style={"height": "42px"},
                )
                if r.get("sparkline")
                else "—"
            )

        body.append(
            dbc.Row(
                [
                    dbc.Col(r["country"], width=2),
                    dbc.Col(
                        html.Div(
                            [
                                r["indicator"],
                                html.Div(
                                    r.get("series_id") or "missing",
                                    className="text-muted small",
                                ),
                            ]
                        ),
                        width=3,
                    ),
                    dbc.Col(val, width=2),
                    dbc.Col(_fmt(r.get("yoy"), suffix=""), width=1),
                    dbc.Col(_fmt(r.get("mom"), suffix=""), width=1),
                    dbc.Col(spark, width=3),
                ],
                className="py-2 border-bottom align-items-center",
            )
        )
    return body


def _heatmap_figure(rows: list[dict]) -> go.Figure:
    df = pd.DataFrame(rows)
    if df.empty:
        return go.Figure()
    pivot = df.pivot_table(index="country", columns="indicator", values="value", aggfunc="first")
    z = pivot.values
    fig = go.Figure(
        data=go.Heatmap(
            z=z,
            x=pivot.columns.tolist(),
            y=pivot.index.tolist(),
            colorscale="RdYlGn",
            zmid=0,
            colorbar=dict(title="Value"),
        )
    )
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="#1a2332",
        plot_bgcolor="#1a2332",
        margin=dict(l=60, r=20, t=40, b=80),
        title="Latest values heatmap",
        height=360,
    )
    return fig


def _multi_country_line(df: pd.DataFrame, title: str) -> go.Figure:
    fig = go.Figure()
    if df.empty:
        fig.update_layout(template="plotly_dark", title=title + " (no data)")
        return fig
    for col in df.columns:
        fig.add_trace(go.Scatter(x=df.index, y=df[col], mode="lines", name=col))
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="#1a2332",
        plot_bgcolor="#121a24",
        title=title,
        height=400,
        legend=dict(orientation="h", y=1.12),
        margin=dict(l=50, r=20, t=60, b=40),
    )
    return fig


def _us_dashboard_figure(api_key: str, lookback_days: int) -> go.Figure:
    """GDP / CPI / Unemployment with NBER recession shading."""
    fig = make_subplots(rows=3, cols=1, shared_xaxes=True, vertical_spacing=0.06)
    try:
        rec = fetch_recession_series(api_key)
    except Exception:
        rec = pd.Series(dtype=float)

    panels = [
        ("gdp", "Real GDP (YoY %)", "yoy_pct"),
        ("cpi", "CPI (YoY %)", "yoy_pct"),
        ("unemployment", "Unemployment %", "level"),
    ]
    for i, (key, label, transform) in enumerate(panels, start=1):
        sid = US_DASHBOARD_SERIES[key]
        try:
            raw = fetch_series(sid, api_key)
            series = apply_transform(raw, transform).dropna()
            if lookback_days:
                cutoff = series.index.max() - pd.Timedelta(days=lookback_days)
                series = series[series.index >= cutoff]
            fig.add_trace(
                go.Scatter(x=series.index, y=series, name=label, mode="lines"),
                row=i,
                col=1,
            )
            if not rec.empty:
                aligned = rec.reindex(series.index).fillna(0)
                for start, end in _recession_spans(aligned):
                    fig.add_vrect(
                        x0=start,
                        x1=end,
                        fillcolor="rgba(239,68,68,0.18)",
                        layer="below",
                        line_width=0,
                        row=i,
                        col=1,
                    )
        except Exception:
            pass
        fig.update_yaxes(title_text=label, row=i, col=1)

    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="#1a2332",
        plot_bgcolor="#121a24",
        height=520,
        title="US Macro Dashboard (NBER recession shading)",
        showlegend=False,
        margin=dict(l=50, r=20, t=50, b=40),
    )
    return fig


def _recession_spans(rec_series: pd.Series) -> list[tuple]:
    spans = []
    in_rec = False
    start = None
    for dt, val in rec_series.items():
        if val >= 1 and not in_rec:
            in_rec = True
            start = dt
        elif val < 1 and in_rec:
            in_rec = False
            spans.append((start, dt))
    if in_rec and start is not None:
        spans.append((start, rec_series.index[-1]))
    return spans


def _yield_curve_figure(api_key: str) -> go.Figure:
    curve = fetch_us_yield_curve(api_key)
    fig = go.Figure()
    if curve.empty:
        fig.update_layout(template="plotly_dark", title="US Yield Curve (no data)")
        return fig
    order = ["3M", "2Y", "5Y", "10Y", "30Y"]
    curve["order"] = curve["tenor"].map({t: i for i, t in enumerate(order)})
    curve = curve.sort_values("order")
    fig.add_trace(
        go.Scatter(
            x=curve["tenor"],
            y=curve["yield"],
            mode="lines+markers",
            line=dict(color="#22c55e", width=2),
            marker=dict(size=8),
        )
    )
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="#1a2332",
        plot_bgcolor="#121a24",
        title="US Treasury Yield Curve (latest)",
        yaxis_title="Yield %",
        height=360,
        margin=dict(l=50, r=20, t=50, b=40),
    )
    return fig


def _policy_inflation_figure(api_key: str, countries: list[str], lookback_days: int) -> go.Figure:
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    try:
        pol = fetch_multi_country_series(api_key, "policy_rate", countries, INDICATOR_CATALOG, lookback_days=lookback_days)
        cpi = fetch_multi_country_series(api_key, "cpi", countries, INDICATOR_CATALOG, lookback_days=lookback_days)
    except Exception:
        pol, cpi = pd.DataFrame(), pd.DataFrame()

    for col in pol.columns:
        fig.add_trace(go.Scatter(x=pol.index, y=pol[col], name=f"{col} policy", mode="lines"), secondary_y=False)
    for col in cpi.columns:
        fig.add_trace(
            go.Scatter(x=cpi.index, y=cpi[col], name=f"{col} CPI YoY", mode="lines", line=dict(dash="dot")),
            secondary_y=True,
        )
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="#1a2332",
        plot_bgcolor="#121a24",
        title="Policy Rate vs CPI YoY",
        height=400,
        legend=dict(orientation="h"),
    )
    fig.update_yaxes(title_text="Policy rate %", secondary_y=False)
    fig.update_yaxes(title_text="CPI YoY %", secondary_y=True)
    return fig


def _build_observations(rows: list[dict], regime: dict) -> list:
    bullets = []
    us = [r for r in rows if r["country"] == "United States" and not r.get("missing")]
    for r in us:
        if r.get("value") is not None:
            bullets.append(
                f"US {r['indicator']}: {_fmt(r['value'])} {r.get('unit', '')} "
                f"(as of {r.get('date', '—')})."
            )
    if regime.get("label"):
        bullets.append(f"Rule-based regime read: {regime['label']}.")
    intl = [r for r in rows if r["country"] != "United States" and not r.get("missing")]
    if intl:
        top = sorted(intl, key=lambda x: x.get("value") or -999, reverse=True)[:3]
        bullets.append(
            "International highlights: "
            + "; ".join(f"{t['country']} {t['indicator']} {_fmt(t.get('value'))}" for t in top)
            + "."
        )
    bullets.append(
        "PMI and some EM policy series may be missing on FRED — treat gaps as data limitations."
    )
    return [html.Li(b) for b in bullets]


def _equity_implications(regime: dict) -> list:
    label = regime.get("label", "")
    items = []
    if "High inflation" in label or "Restrictive" in label:
        items.append("Higher discount rates pressure long-duration growth; favor pricing power and cash returns.")
    elif "Inversion" in label or "Slowdown" in label:
        items.append("Curve inversion historically precedes slower growth — defensives and quality may outperform.")
    elif "Disinflation" in label:
        items.append("Falling inflation supports multiple expansion if earnings hold — rate-sensitive sectors may rally.")
    elif "Contraction" in label:
        items.append("Earnings revisions risk — reduce cyclical beta; watch credit spreads.")
    else:
        items.append("Mixed macro — stock-picking and sector dispersion likely dominate index direction.")
    items.append("Cross-check with earnings revisions, credit conditions, and USD moves before sizing risk.")
    return [html.Li(x) for x in items]


# ---------------------------------------------------------------------------
# Layout — sidebar controls + tabbed main area
# ---------------------------------------------------------------------------

indicator_options = [
    {"label": meta["label"], "value": key}
    for key, meta in INDICATOR_CATALOG.items()
]

sidebar = html.Div(
    [
        html.H5([html.I(className="bi bi-sliders me-2"), "Controls"]),
        html.Hr(),
        html.Label("FRED API Key", className="fw-semibold"),
        dbc.Input(
            id="fred-api-key",
            type="password",
            placeholder="Paste 32-char FRED key",
            className="mb-1",
        ),
        html.Small(
            [
                "Free key: ",
                html.A(
                    "fred.stlouisfed.org/docs/api/api_key.html",
                    href="https://fred.stlouisfed.org/docs/api/api_key.html",
                    target="_blank",
                ),
                " → My Account → API Keys.",
            ],
            className="text-muted d-block mb-3",
        ),
        html.Label("Countries", className="fw-semibold"),
        dcc.Dropdown(
            id="country-select",
            options=[{"label": c, "value": c} for c in DEFAULT_COUNTRIES],
            value=DEFAULT_COUNTRIES,
            multi=True,
            className="mb-3 dark-dropdown",
        ),
        html.Label("Indicators", className="fw-semibold"),
        dcc.Dropdown(
            id="indicator-select",
            options=indicator_options,
            value=DEFAULT_INDICATORS,
            multi=True,
            className="mb-3",
        ),
        html.Label("Time period", className="fw-semibold"),
        dcc.Dropdown(
            id="period-select",
            options=[{"label": k, "value": k} for k in PERIOD_OPTIONS],
            value="5Y",
            clearable=False,
            className="mb-3",
        ),
        dbc.Button(
            [html.I(className="bi bi-arrow-clockwise me-2"), "Refresh Macro Data"],
            id="refresh-btn",
            color="primary",
            className="w-100 btn-refresh mb-3",
        ),
        html.Div(id="refresh-status", className="small text-muted mb-4"),
        html.Hr(),
        html.H6("Portfolio (all tabs)"),
        dbc.Row(
            [
                dbc.Col(dbc.Input(id="pf-symbol", placeholder="Symbol", size="sm"), width=4),
                dbc.Col(dbc.Input(id="pf-shares", placeholder="Shares", type="number", size="sm"), width=4),
                dbc.Col(dbc.Input(id="pf-cost", placeholder="Cost", type="number", size="sm"), width=4),
            ],
            className="g-1 mb-2",
        ),
        dbc.Button("Add holding", id="pf-add", size="sm", color="secondary", className="mb-2"),
        html.Div(id="portfolio-sidebar-summary", className="small"),
    ],
    className="sidebar",
)

main_tabs = dbc.Tabs(
    [
        dbc.Tab(label="1 · Portfolio", tab_id="tab-portfolio"),
        dbc.Tab(label="2 · Cross-Asset", tab_id="tab-cross"),
        dbc.Tab(label="3 · Macro Drivers", tab_id="tab-macro"),
    ],
    id="main-tabs",
    active_tab="tab-macro",
    className="mb-3",
)

macro_sections = dbc.Tabs(
    [
        dbc.Tab(label="Snapshot", tab_id="macro-snapshot"),
        dbc.Tab(label="Trends & Charts", tab_id="macro-trends"),
        dbc.Tab(label="Leading Indicators", tab_id="macro-leading"),
        dbc.Tab(label="Commentary", tab_id="macro-commentary"),
    ],
    id="macro-subtabs",
    active_tab="macro-snapshot",
    className="mb-3",
)

app.layout = dbc.Container(
    [
        dcc.Store(id="macro-payload-store"),
        dcc.Store(id="portfolio-store", storage_type="local", data=empty_portfolio()),
        dcc.Store(id="commentary-store", storage_type="local"),
        dbc.Row(
            [
                dbc.Col(sidebar, width=3, className="p-0"),
                dbc.Col(
                    [
                        html.Div(
                            [
                                html.H2("Macro Drivers", className="mb-0"),
                                html.P(
                                    "Multi-country macro dashboard powered by FRED.",
                                    className="text-muted",
                                ),
                            ],
                            className="mb-3",
                        ),
                        main_tabs,
                        html.Div(id="macro-subtabs-wrap", children=[macro_sections], className="d-none"),
                        html.Div(id="tab-content"),
                        html.Div(
                            [
                                dbc.Accordion(
                                    [
                                        dbc.AccordionItem(
                                            [
                                                html.Ul(
                                                    [
                                                        html.Li("Primary: FRED (Federal Reserve Economic Data) — publication lags vary by series."),
                                                        html.Li("Portfolio marks: Yahoo Finance via yfinance (~15 min delayed)."),
                                                        html.Li("International PMI/policy coverage is incomplete on FRED; missing cells are expected."),
                                                        html.Li("Rule-based regime badge is heuristic — not investment advice."),
                                                        html.Li("Cache TTL: 6 hours per series to respect FRED rate limits."),
                                                    ]
                                                ),
                                            ],
                                            title="Data Sources & Limitations",
                                        ),
                                    ],
                                    start_collapsed=True,
                                    flush=True,
                                ),
                            ],
                            className="footer-note",
                        ),
                    ],
                    width=9,
                    className="main-content",
                ),
            ],
            className="app-shell g-0",
        ),
    ],
    fluid=True,
)


# ---------------------------------------------------------------------------
# Callbacks — data refresh, tab routing, portfolio, commentary
# ---------------------------------------------------------------------------


@callback(
    Output("macro-payload-store", "data"),
    Output("refresh-status", "children"),
    Input("refresh-btn", "n_clicks"),
    State("fred-api-key", "value"),
    State("country-select", "value"),
    State("indicator-select", "value"),
    State("period-select", "value"),
    prevent_initial_call=False,
)
def refresh_macro_data(n_clicks, api_key, countries, indicators, period):
    if not api_key:
        return no_update, "Enter a FRED API key to load data."
    if not countries or not indicators:
        return no_update, "Select at least one country and indicator."

    if n_clicks and n_clicks > 0:
        clear_cache()

    lookback = PERIOD_OPTIONS.get(period or "5Y", 365 * 5)
    try:
        panel = fetch_indicator_panel(
            api_key,
            countries,
            indicators,
            INDICATOR_CATALOG,
            lookback_days=lookback,
        )
        us_rows = {r["indicator_key"]: r.get("value") for r in panel["rows"] if r["country"] == "United States"}
        regime = classify_regime(
            {
                "cpi": us_rows.get("cpi"),
                "unemployment": us_rows.get("unemployment"),
                "yield_curve": us_rows.get("yield_curve"),
                "gdp_real": us_rows.get("gdp_real"),
            }
        )
        payload = {
            "panel": panel,
            "regime": regime,
            "countries": countries,
            "indicators": indicators,
            "period": period,
            "lookback_days": lookback,
            "api_key": api_key,
        }
        err_count = len(panel.get("errors") or [])
        status = f"Updated {panel.get('fetched_at', '')[:19]}Z"
        if err_count:
            status += f" · {err_count} series warning(s)"
        return payload, status
    except Exception as exc:  # noqa: BLE001
        return no_update, f"Refresh failed: {exc}"


@callback(
    Output("portfolio-store", "data"),
    Input("pf-add", "n_clicks"),
    State("portfolio-store", "data"),
    State("pf-symbol", "value"),
    State("pf-shares", "value"),
    State("pf-cost", "value"),
    prevent_initial_call=True,
)
def add_portfolio_row(n, holdings, symbol, shares, cost):
    holdings = normalize_holdings(holdings)
    sym = (symbol or "").strip().upper()
    if not sym:
        return holdings
    holdings.append({"symbol": sym, "shares": float(shares or 0), "cost": float(cost or 0)})
    return holdings


@callback(
    Output("portfolio-sidebar-summary", "children"),
    Input("portfolio-store", "data"),
)
def update_portfolio_sidebar(holdings):
    summary = portfolio_summary(holdings)
    if not summary["rows"]:
        return html.Span("No holdings yet.", className="text-muted")
    pnl_color = "text-success" if (summary.get("total_pnl") or 0) >= 0 else "text-danger"
    return html.Div(
        [
            html.Div(f"Value: ${_fmt(summary['total_value'], 0)}", className="portfolio-total"),
            html.Div(
                f"P&L: ${_fmt(summary.get('total_pnl'), 0)} ({_fmt(summary.get('total_pnl_pct'))}%)",
                className=pnl_color,
            ),
        ]
    )


@callback(
    Output("macro-subtabs-wrap", "className"),
    Input("main-tabs", "active_tab"),
)
def toggle_macro_subtabs(main_tab):
    return "" if main_tab == "tab-macro" else "d-none"


@callback(
    Output("tab-content", "children"),
    Input("main-tabs", "active_tab"),
    Input("macro-subtabs", "active_tab"),
    Input("macro-payload-store", "data"),
    Input("portfolio-store", "data"),
    State("commentary-store", "data"),
)
def render_tab(main_tab, macro_sub, payload, holdings, saved_commentary):
    payload = payload or {}
    panel = payload.get("panel") or {}
    rows = panel.get("rows") or []
    regime = payload.get("regime") or {}
    api_key = payload.get("api_key")
    lookback = payload.get("lookback_days", 365 * 5)
    countries = payload.get("countries") or DEFAULT_COUNTRIES

    if main_tab == "tab-portfolio":
        summary = portfolio_summary(holdings)
        pf_rows = summary.get("rows") or []
        table_header = html.Thead(
            html.Tr([html.Th(x) for x in ["Symbol", "Shares", "Cost", "Price", "MV", "P&L", "P&L %"]])
        )
        table_body = html.Tbody(
            [
                html.Tr(
                    [
                        html.Td(r["symbol"]),
                        html.Td(_fmt(r["shares"], 2)),
                        html.Td(_fmt(r["cost"], 2)),
                        html.Td(_fmt(r.get("price"), 2)),
                        html.Td(_fmt(r.get("market_value"), 0)),
                        html.Td(_fmt(r.get("pnl"), 0)),
                        html.Td(_fmt(r.get("pnl_pct"), 1)),
                    ]
                )
                for r in pf_rows
            ]
        )
        return dbc.Card(
            [
                dbc.CardHeader("Portfolio Tracker"),
                dbc.CardBody(
                    [
                        html.P("Marks via Yahoo Finance — shared across all tabs.", className="text-muted"),
                        dbc.Table([table_header, table_body], bordered=True, dark=True, hover=True, size="sm"),
                        html.Div(
                            f"Total ${_fmt(summary.get('total_value'), 0)} · "
                            f"P&L ${_fmt(summary.get('total_pnl'), 0)} ({_fmt(summary.get('total_pnl_pct'))}%)",
                            className="portfolio-total mt-2",
                        ),
                    ]
                ),
            ],
            className="card-dark",
        )

    if main_tab == "tab-cross":
        return dbc.Card(
            [
                dbc.CardHeader("Cross-Asset Monitor"),
                dbc.CardBody(
                    [
                        html.P(
                            "Placeholder for rates, FX, and commodity overlays. "
                            "Use Tab 3 Macro Drivers for FRED-based analysis; "
                            "portfolio marks refresh from the sidebar on every tab.",
                            className="text-muted",
                        ),
                        dcc.Graph(figure=_multi_country_line(
                            fetch_multi_country_series(api_key, "yield_10y", countries, INDICATOR_CATALOG, lookback_days=lookback)
                            if api_key else pd.DataFrame(),
                            "10Y yields (if FRED key loaded)",
                        )),
                    ]
                ),
            ],
            className="card-dark",
        )

    # Tab 3 — Macro Drivers
    regime_badge = dbc.Badge(
        regime.get("label", "Awaiting data"),
        color=regime.get("color", "secondary"),
        className="regime-badge",
    )

    if macro_sub == "macro-snapshot":
        return html.Div(
            [
                dbc.Card(
                    [
                        dbc.CardHeader("Latest Macro Snapshot"),
                        dbc.CardBody(
                            [
                                html.Div(regime_badge, className="mb-3"),
                                html.Div(_build_snapshot_table(rows), className="snapshot-table"),
                                dcc.Graph(figure=_heatmap_figure(rows), config={"displayModeBar": False}),
                            ]
                        ),
                    ],
                    className="card-dark",
                ),
            ]
        )

    if macro_sub == "macro-trends":
        ind = (payload.get("indicators") or DEFAULT_INDICATORS)[0]
        df = (
            fetch_multi_country_series(api_key, ind, countries, INDICATOR_CATALOG, lookback_days=lookback)
            if api_key
            else pd.DataFrame()
        )
        meta = INDICATOR_CATALOG.get(ind, {})
        return html.Div(
            [
                dbc.Card(
                    [
                        dbc.CardHeader("Multi-Country Trends"),
                        dbc.CardBody(
                            [
                                html.P(
                                    f"Showing: {meta.get('label', ind)} — change indicator filter in sidebar and refresh.",
                                    className="text-muted small",
                                ),
                                dcc.Graph(figure=_multi_country_line(df, meta.get("label", ind))),
                            ]
                        ),
                    ],
                    className="card-dark",
                ),
                dbc.Row(
                    [
                        dbc.Col(
                            dbc.Card(
                                [dbc.CardHeader("US Yield Curve"), dbc.CardBody(dcc.Graph(figure=_yield_curve_figure(api_key) if api_key else go.Figure()))],
                                className="card-dark",
                            ),
                            md=6,
                        ),
                        dbc.Col(
                            dbc.Card(
                                [
                                    dbc.CardHeader("US GDP / CPI / Unemployment"),
                                    dbc.CardBody(
                                        dcc.Graph(
                                            figure=_us_dashboard_figure(api_key, lookback) if api_key else go.Figure()
                                        )
                                    ),
                                ],
                                className="card-dark",
                            ),
                            md=6,
                        ),
                    ]
                ),
                dbc.Card(
                    [
                        dbc.CardHeader("Policy Rate vs Inflation"),
                        dbc.CardBody(
                            dcc.Graph(
                                figure=_policy_inflation_figure(api_key, countries, lookback) if api_key else go.Figure()
                            )
                        ),
                    ],
                    className="card-dark",
                ),
            ]
        )

    if macro_sub == "macro-leading":
        pmi_rows = [r for r in rows if r.get("indicator_key") == "pmi_manufacturing"]
        note = INDICATOR_CATALOG.get("pmi_manufacturing", {}).get("fallback_note", "")
        return html.Div(
            [
                dbc.Card(
                    [
                        dbc.CardHeader("Leading Indicators — Manufacturing PMI"),
                        dbc.CardBody(
                            [
                                html.P(note, className="text-muted"),
                                html.Div(_build_snapshot_table(pmi_rows), className="snapshot-table"),
                                dcc.Graph(
                                    figure=_multi_country_line(
                                        fetch_multi_country_series(
                                            api_key, "pmi_manufacturing", countries, INDICATOR_CATALOG, lookback_days=lookback
                                        )
                                        if api_key
                                        else pd.DataFrame(),
                                        "Manufacturing PMI",
                                    )
                                ),
                            ]
                        ),
                    ],
                    className="card-dark",
                ),
            ]
        )

    # Commentary
    commentary_text = saved_commentary or DEFAULT_COMMENTARY.format(date=datetime.utcnow().strftime("%Y-%m-%d"))
    return html.Div(
        [
            dbc.Card(
                [
                    dbc.CardHeader("Commentary & Outlook"),
                    dbc.CardBody(
                        [
                            html.Div(regime_badge, className="mb-3"),
                            html.H6("Key observations"),
                            html.Ul(_build_observations(rows, regime)),
                            html.H6("Equity market implications"),
                            html.Ul(_equity_implications(regime)),
                            html.H6("Your macro notes"),
                            dcc.Textarea(
                                id="commentary-text",
                                value=commentary_text,
                                className="w-100 commentary-area",
                            ),
                            dbc.Row(
                                [
                                    dbc.Col(
                                        dbc.Button("Save notes", id="save-commentary", color="secondary", size="sm"),
                                        width="auto",
                                    ),
                                    dbc.Col(
                                        dbc.Button("Download notes", id="download-commentary", color="outline-light", size="sm"),
                                        width="auto",
                                    ),
                                ],
                                className="mt-2 g-2",
                            ),
                            dcc.Download(id="download-commentary-dl"),
                            html.Div(id="commentary-save-status", className="small text-muted mt-2"),
                        ]
                    ),
                ],
                className="card-dark",
            ),
        ]
    )


@callback(
    Output("commentary-store", "data"),
    Output("commentary-save-status", "children"),
    Input("save-commentary", "n_clicks"),
    State("commentary-text", "value"),
    prevent_initial_call=True,
)
def save_commentary(n, text):
    return text, f"Saved locally at {datetime.utcnow().strftime('%H:%M:%S')} UTC."


@callback(
    Output("download-commentary-dl", "data"),
    Input("download-commentary", "n_clicks"),
    State("commentary-text", "value"),
    prevent_initial_call=True,
)
def download_commentary(n, text):
    content = text or ""
    return dict(content=content, filename=f"macro-outlook-{datetime.utcnow().strftime('%Y%m%d')}.md")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=8050)