"""Displayed clocks use Europe/Rome, including both sides of the Oct 2026 DST end.

A fixed +1 or +2 offset fails one of the instants below. The node process
runs with TZ=UTC so a browser-local formatter cannot pass on a Rome host.
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
const src = fs.readFileSync("swr-cache.js", "utf8");
global.window = global;
global.document = { getElementById() { return null; }, body: { dataset: {} } };
global.localStorage = {
  getItem() { return null; },
  setItem() {},
  length: 0,
  key() { return null; },
};
global.setInterval = () => 0;
(0, eval)(src);
const fmt = global.DashboardSWR.formatFetchedTime;
const cases = [
  ["2026-10-24T07:42:00Z", "09:42:00"],
  ["2026-10-25T00:30:00Z", "02:30:00"],
  ["2026-10-25T01:00:00Z", "02:00:00"],
  ["2026-10-25T01:30:00Z", "02:30:00"],
  ["", "—"],
  ["not-a-time", "—"],
];
const out = {
  zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  rows: cases.map(([iso]) => [iso, fmt(iso)]),
  millis: fmt(Date.parse("2026-10-24T07:42:00Z")),
};
process.stdout.write(JSON.stringify(out));
"""


def test_format_fetched_time_follows_rome_across_dst():
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
    assert got["zone"] == "UTC"
    expect = {
        "2026-10-24T07:42:00Z": "09:42:00",
        "2026-10-25T00:30:00Z": "02:30:00",
        "2026-10-25T01:00:00Z": "02:00:00",
        "2026-10-25T01:30:00Z": "02:30:00",
        "": "—",
        "not-a-time": "—",
    }
    assert dict(got["rows"]) == expect
    assert got["millis"] == "09:42:00"


if __name__ == "__main__":
    test_format_fetched_time_follows_rome_across_dst()
    print("ok")
