#!/usr/bin/env python3
"""Local launcher when the process is not server.py __main__.

Loads server.py as server_mod so the __main__ block does not bind the port,
starts the one warm thread from that namespace, then binds the HTTP server.
Vercel imports server at import time and must not start this loop.
"""

from __future__ import annotations

import os
import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

mod = runpy.run_path(str(ROOT / "server.py"), run_name="server_mod")
mod["serve_forever_app"]()
