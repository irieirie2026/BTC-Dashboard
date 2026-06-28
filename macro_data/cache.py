"""Disk-backed cache with in-memory layer for macro data fetches.

Falls back to memory-only when the filesystem is read-only (e.g. Vercel serverless).
Uses /tmp on serverless platforms when no explicit cache dir is set.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

_DEFAULT_DAYS = int(os.environ.get("BTC_MACRO_CACHE_DAYS", "3"))
DEFAULT_TTL = _DEFAULT_DAYS * 24 * 3600

_mem: dict[str, dict[str, Any]] = {}
_disk_ok: bool | None = None


def _default_cache_dir() -> Path:
    explicit = os.environ.get("BTC_MACRO_CACHE_DIR", "").strip()
    if explicit:
        return Path(explicit)
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return Path("/tmp/btc-macro-cache")
    return Path(".cache/macro")


CACHE_DIR = _default_cache_dir()


def _key_path(key: str) -> Path:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
    return CACHE_DIR / f"{digest}.json"


def _disk_enabled() -> bool:
    global _disk_ok
    if _disk_ok is not None:
        return _disk_ok
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        probe = CACHE_DIR / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        _disk_ok = True
    except OSError:
        _disk_ok = False
    return _disk_ok


def cache_get(key: str, *, ttl: int = DEFAULT_TTL) -> Any | None:
    now = time.time()
    mem = _mem.get(key)
    if mem and now - mem["ts"] <= ttl:
        return mem["data"]

    if not _disk_enabled():
        return None

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

    if not _disk_enabled():
        return

    path = _key_path(key)
    tmp = path.with_suffix(".tmp")
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps({"ts": ts, "data": data}), encoding="utf-8")
        tmp.replace(path)
    except OSError:
        global _disk_ok
        _disk_ok = False


def clear_cache() -> None:
    _mem.clear()
    if not _disk_enabled():
        return
    if CACHE_DIR.exists():
        for p in CACHE_DIR.glob("*.json"):
            try:
                p.unlink()
            except OSError:
                pass