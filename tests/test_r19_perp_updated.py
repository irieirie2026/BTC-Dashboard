"""Perp UPDATED follows each cached fetchedAt and goes STALE at two minutes.

An expired perp cache must still answer the idle read. The open tab was
aborting the live fetch and keeping the previous stamp, so 07:45:12Z and
07:45:32Z never reached the card.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.isolation import claim_temp_dirs

claim_temp_dirs()

_NODE = r"""
const fs = require("fs");
const src = fs.readFileSync("app.js", "utf8");
function extract(name) {
  const start = src.indexOf("function " + name);
  if (start < 0) throw new Error("missing " + name);
  let depth = 0;
  let opened = false;
  for (let j = src.indexOf("{", start); j < src.length; j++) {
    if (src[j] === "{") {
      depth += 1;
      opened = true;
    } else if (src[j] === "}") {
      depth -= 1;
      if (opened && depth === 0) {
        return src.slice(start, j + 1);
      }
    }
  }
  throw new Error("unclosed " + name);
}
eval(extract("perpQuoteShouldApply"));
eval(extract("perpAgeIsStale"));
const fetched = Date.parse("2026-10-24T07:42:48Z");
const out = {
  apply4512: perpQuoteShouldApply("2026-10-24T07:42:48Z", "2026-10-24T07:45:12Z"),
  apply4532: perpQuoteShouldApply("2026-10-24T07:45:12Z", "2026-10-24T07:45:32Z"),
  apply4813: perpQuoteShouldApply("2026-10-24T07:45:32Z", "2026-10-24T07:48:13Z"),
  skipOlder: perpQuoteShouldApply("2026-10-24T07:45:32Z", "2026-10-24T07:42:48Z"),
  skipSame: perpQuoteShouldApply("2026-10-24T07:45:32Z", "2026-10-24T07:45:32Z"),
  stale119: perpAgeIsStale("2026-10-24T07:42:48Z", fetched + 119000),
  stale120: perpAgeIsStale("2026-10-24T07:42:48Z", fetched + 120000),
  stale339: perpAgeIsStale("2026-10-24T07:42:48Z", fetched + 339000),
};
process.stdout.write(JSON.stringify(out));
"""


def test_perp_updated_follows_fetched_at_and_goes_stale(monkeypatch):
    import market_feed
    from api_dispatch import dispatch_api

    def boom(*_args, **_kwargs):
        raise AssertionError("idle perp read must not live-fetch")

    monkeypatch.setattr(market_feed, "_okx_perp", boom)
    monkeypatch.setattr(market_feed, "_hl_perp", boom)
    monkeypatch.setattr(market_feed, "_bybit_perp", boom)
    monkeypatch.setattr(market_feed, "_fetch_json", boom)

    key = "market:perp:v3"
    saved = market_feed._CACHE.get(key)
    try:
        market_feed._CACHE[key] = (
            time.time() - 10_000,
            {"lastPrice": 100.0, "fetchedAt": "2026-10-24T07:45:12Z", "venue": "OKX"},
        )
        first = dispatch_api("/api/market/perp", {})
        assert first["fetchedAt"] == "2026-10-24T07:45:12Z"
        assert first["fromCache"] is True

        market_feed._CACHE[key] = (
            time.time() - 10_000,
            {"lastPrice": 101.0, "fetchedAt": "2026-10-24T07:45:32Z", "venue": "OKX"},
        )
        second = dispatch_api("/api/market/perp", {})
        assert second["fetchedAt"] == "2026-10-24T07:45:32Z"
    finally:
        if saved is None:
            market_feed._CACHE.pop(key, None)
        else:
            market_feed._CACHE[key] = saved

    env = os.environ.copy()
    env["TZ"] = "UTC"
    proc = subprocess.run(
        ["node", "-e", _NODE],
        cwd=_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    got = json.loads(proc.stdout)
    assert got["apply4512"] is True
    assert got["apply4532"] is True
    assert got["apply4813"] is True
    assert got["skipOlder"] is False
    assert got["skipSame"] is False
    assert got["stale119"] is False
    assert got["stale120"] is True
    assert got["stale339"] is True


if __name__ == "__main__":
    class _Patch:
        def setattr(self, obj, name, value):
            setattr(obj, name, value)

    test_perp_updated_follows_fetched_at_and_goes_stale(_Patch())
    print("ok")
