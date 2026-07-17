#!/usr/bin/env python3
"""Diagnose S&P 500 normalized performance."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from equity_insights import (  # noqa: E402
    build_performance_series,
    download_history,
    period_to_dates,
    trading_day_closes,
)


def main() -> None:
    start, end = period_to_dates("5Y", None, None)
    print("download range", start, end)
    hist = download_history(["^GSPC", "^DJI", "^IXIC"], start, end)
    for sym, df in hist.items():
        c = df["Close"].dropna()
        print(
            f"\n{sym} raw n={len(c)} first={c.index[0]} last={c.index[-1]} "
            f"first_px={float(c.iloc[0]):.2f} last_px={float(c.iloc[-1]):.2f} "
            f"max_px={float(c.max()):.2f} max_at={c.idxmax()} "
            f"last_vs_max={(float(c.iloc[-1]) / float(c.max()) - 1) * 100:.2f}%"
        )
        td = trading_day_closes(df["Close"])
        print(
            f"  trading_days n={len(td)} first={td.index[0]} last={td.index[-1]} "
            f"last_px={float(td.iloc[-1]):.2f} max={float(td.max()):.2f}"
        )

    labels = {"^GSPC": "S&P 500", "^DJI": "Dow Jones", "^IXIC": "Nasdaq"}
    for period in ["1Y", "YTD", "5Y", "1M", "3Y"]:
        perf = build_performance_series(hist, labels, period)
        sp = perf["series"].get("S&P 500")
        if not sp:
            print(period, "NO SPX")
            continue
        vals = [v for v in sp["values"] if v is not None]
        dates = sp["dates"]
        print(
            f"\n{period}: n={len(vals)} start={dates[0]} end={dates[-1]} "
            f"rebased_start={vals[0]:.2f} rebased_end={vals[-1]:.2f} "
            f"rebased_max={max(vals):.2f} max_date={dates[vals.index(max(vals))]} "
            f"end_vs_max={vals[-1] - max(vals):.2f}"
        )
        print("  last 8:", list(zip(dates[-8:], [round(v, 2) for v in vals[-8:]])))
        assert dates == sorted(dates), "DATES NOT SORTED"
        assert abs(vals[0] - 100) < 1e-6, f"base not 100: {vals[0]}"


if __name__ == "__main__":
    main()
