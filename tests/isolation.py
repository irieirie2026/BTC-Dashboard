"""Keep pytest and plain runners off the live data and cache trees."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE_DATA = (ROOT / "data").resolve()
LIVE_CACHE = (ROOT / ".cache" / "macro").resolve()


def _under(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


def require_isolated_dirs() -> None:
    """Raise when the cache or data env is missing or points at the live tree."""
    cache = (os.environ.get("BTC_MACRO_CACHE_DIR") or "").strip()
    data = (os.environ.get("BTC_DASH_DATA_DIR") or "").strip()
    if not cache or not data:
        raise RuntimeError(
            "Refusing to run against live dirs: set BTC_MACRO_CACHE_DIR and BTC_DASH_DATA_DIR"
        )
    cache_path = Path(cache).resolve()
    data_path = Path(data).resolve()
    if cache_path == LIVE_CACHE or _under(cache_path, LIVE_CACHE):
        raise RuntimeError("BTC_MACRO_CACHE_DIR points at the live cache")
    if data_path == LIVE_DATA or _under(data_path, LIVE_DATA):
        raise RuntimeError("BTC_DASH_DATA_DIR points at the live data dir")


def claim_temp_dirs() -> None:
    """Point a plain runner at a temp tree before any cache import."""
    import tempfile

    if (os.environ.get("BTC_MACRO_CACHE_DIR") or "").strip() and (
        os.environ.get("BTC_DASH_DATA_DIR") or ""
    ).strip():
        require_isolated_dirs()
        return
    tmp = Path(tempfile.mkdtemp(prefix="btc-plain-"))
    os.environ["BTC_MACRO_CACHE_DIR"] = str(tmp / "cache")
    os.environ["BTC_DASH_DATA_DIR"] = str(tmp / "data")
    os.environ["BTC_SERIES_DIR"] = str(tmp / "series")
    os.environ["XMARKET_HISTORY_PATH"] = str(tmp / "xmarket.jsonl")
    require_isolated_dirs()
