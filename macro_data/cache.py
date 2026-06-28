"""Disk-backed cache with in-memory layer for macro data fetches."""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

CACHE_DIR = Path(os.environ.get("BTC_MACRO_CACHE_DIR", ".cache/macro"))
# Macro research data: keep on disk for several days; refresh only on explicit request.
_DEFAULT_DAYS = int(os.environ.get("BTC_MACRO_CACHE_DAYS", "3"))
DEFAULT_TTL = _DEFAULT_DAYS * 24 * 3600

_mem: dict[str, dict[str, Any]] = {}


def _key_path(key: str) -> Path:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
    return CACHE_DIR / f"{digest}.json"


def cache_get(key: str, *, ttl: int = DEFAULT_TTL) -> Any | None:
    now = time.time()
    mem = _mem.get(key)
    if mem and now - mem["ts"] <= ttl:
        return mem["data"]

    path = _key_path(key)
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if now - raw.get("ts", 0) > ttl:
            return None
        _mem[key] = {"ts": raw["ts"], "data": raw["data"]}
        return raw["data"]
    except (OSError, json.JSONDecodeError, KeyError):
        return None


def cache_set(key: str, data: Any) -> None:
    ts = time.time()
    _mem[key] = {"ts": ts, "data": data}
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _key_path(key)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"ts": ts, "data": data}), encoding="utf-8")
    tmp.replace(path)


def clear_cache() -> None:
    _mem.clear()
    if CACHE_DIR.exists():
        for p in CACHE_DIR.glob("*.json"):
            try:
                p.unlink()
            except OSError:
                pass