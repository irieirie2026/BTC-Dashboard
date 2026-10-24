"""Make `pytest` from the repo root import the app without PYTHONPATH.

Series, the stats history cache, and the cross-market log go to a tmp dir
so a test run never rewrites the tracked ``data/`` tree.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_TEST_DATA = Path(tempfile.mkdtemp(prefix="btc-dash-pytest-"))
os.environ["BTC_DASH_DATA_DIR"] = str(_TEST_DATA)
os.environ["BTC_SERIES_DIR"] = str(_TEST_DATA / "btc-series")
os.environ["XMARKET_HISTORY_PATH"] = str(_TEST_DATA / "xmarket_history.jsonl")
os.environ["BTC_MACRO_CACHE_DIR"] = str(_TEST_DATA / "macro-cache")

from tests.isolation import require_isolated_dirs

require_isolated_dirs()
