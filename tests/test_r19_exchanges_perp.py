"""Exchanges > Perp UPDATED follows each fetchedAt and goes STALE at two minutes.

The desk missed 11:22:24 Rome (2026-10-24T09:22:24Z) because this view polled
every 300s and only marked STALE at 600s. An age of 332s stayed untagged.
Overview, spot, and volume stay on that slower clock.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.isolation import claim_temp_dirs

claim_temp_dirs()

_NODE = r"""
const fs = require("fs");
const src = fs.readFileSync("exchanges.js", "utf8");
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
function grabConst(name) {
  const m = src.match(new RegExp("const " + name + " = ([0-9_]+);"));
  if (!m) throw new Error("missing " + name);
  return m[1];
}
const out = eval("(function(){\n" +
  "const EXCHANGES_POLL_MS = " + grabConst("EXCHANGES_POLL_MS") + ";\n" +
  "const EXCHANGES_PERP_POLL_MS = " + grabConst("EXCHANGES_PERP_POLL_MS") + ";\n" +
  "const EXCHANGES_PERP_STALE_MS = " + grabConst("EXCHANGES_PERP_STALE_MS") + ";\n" +
  "const EXCHANGES_PERP_WATCH_MS = " + grabConst("EXCHANGES_PERP_WATCH_MS") + ";\n" +
  extract("exchangesSectionStaleMs") + "\n" +
  extract("exchangesPerpShouldApply") + "\n" +
  extract("exchangesPerpAgeIsStale") + "\n" +
  "const missed = '2026-10-24T09:22:24Z';\n" +
  "const before = '2026-10-24T09:16:52Z';\n" +
  "const missedMs = Date.parse(missed);\n" +
  "return {\n" +
  "  pollMs: EXCHANGES_POLL_MS,\n" +
  "  perpPollMs: EXCHANGES_PERP_POLL_MS,\n" +
  "  perpStaleMs: EXCHANGES_PERP_STALE_MS,\n" +
  "  stalePerp: exchangesSectionStaleMs('perp'),\n" +
  "  staleOverview: exchangesSectionStaleMs('overview'),\n" +
  "  staleSpot: exchangesSectionStaleMs('spot'),\n" +
  "  staleVolume: exchangesSectionStaleMs('volume'),\n" +
  "  applyMissed: exchangesPerpShouldApply(before, missed),\n" +
  "  applyNext: exchangesPerpShouldApply(missed, '2026-10-24T09:22:54Z'),\n" +
  "  skipOlder: exchangesPerpShouldApply(missed, before),\n" +
  "  skipSame: exchangesPerpShouldApply(missed, missed),\n" +
  "  stale119: exchangesPerpAgeIsStale(missed, missedMs + 119000),\n" +
  "  stale120: exchangesPerpAgeIsStale(missed, missedMs + 120000),\n" +
  "  stale332: exchangesPerpAgeIsStale(before, missedMs),\n" +
  "  watchMs: EXCHANGES_PERP_WATCH_MS,\n" +
  "};\n" +
"})()");
out.perpRefresh = src.includes('section === "perp" && refresh ? "&refresh=1" : ""');
out.perpCard = src.includes('cardIds: ["exchanges-perp-update"]');
out.perpPollWired = src.includes("EXCHANGES_PERP_POLL_MS");
out.slowPollKept = src.includes("EXCHANGES_POLL_MS");
process.stdout.write(JSON.stringify(out));
"""


def test_exchanges_perp_updated_follows_fetch_and_goes_stale():
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
    assert got["pollMs"] == 300_000
    assert 0 < got["perpPollMs"] <= 30_000
    assert 0 < got["watchMs"] <= 10_000
    assert got["perpStaleMs"] == 120_000
    assert got["stalePerp"] == 120_000
    assert got["staleOverview"] == 600_000
    assert got["staleSpot"] == 600_000
    assert got["staleVolume"] == 600_000
    assert got["applyMissed"] is True
    assert got["applyNext"] is True
    assert got["skipOlder"] is False
    assert got["skipSame"] is False
    assert got["stale119"] is False
    assert got["stale120"] is True
    assert got["stale332"] is True
    assert got["perpRefresh"] is True
    assert got["perpCard"] is True
    assert got["perpPollWired"] is True
    assert got["slowPollKept"] is True


if __name__ == "__main__":
    test_exchanges_perp_updated_follows_fetch_and_goes_stale()
    print("ok")
