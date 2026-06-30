"""
Unified cache service: Redis (L1) → disk (L2) → process memory (L3).

Cache-aside by default; write-through on set() populates all enabled tiers.
Falls back transparently when Redis is down.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Callable

from cache.config import (
    DEFAULT_TTL,
    KEY_PREFIX,
    STALE_TTL_MULTIPLIER,
    redis_active,
)
from cache.redis_client import get_redis_client, redis_connected

_log = logging.getLogger(__name__)

_mem: dict[str, dict[str, Any]] = {}
_disk_ok: bool | None = None
_stats = {
    "hits": 0,
    "misses": 0,
    "redis_hits": 0,
    "disk_hits": 0,
    "mem_hits": 0,
    "sets": 0,
    "errors": 0,
    "fetches": 0,
}


def _default_cache_dir() -> Path:
    explicit = os.environ.get("BTC_MACRO_CACHE_DIR", "").strip()
    if explicit:
        return Path(explicit)
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return Path("/tmp/btc-macro-cache")
    return Path(".cache/macro")


CACHE_DIR = _default_cache_dir()


def _redis_key(key: str) -> str:
    if key.startswith(f"{KEY_PREFIX}:"):
        return key
    return f"{KEY_PREFIX}:{key}"


def _disk_path(key: str) -> Path:
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


def _serialize(data: Any) -> str:
    return json.dumps({"ts": time.time(), "data": data}, default=str)


def _deserialize(raw: str) -> tuple[float, Any] | None:
    try:
        parsed = json.loads(raw)
        return float(parsed.get("ts", 0)), parsed.get("data")
    except (json.JSONDecodeError, TypeError, ValueError):
        return None


class CacheService:
    """Central cache facade."""

    def get(self, key: str, *, ttl: int = DEFAULT_TTL) -> Any | None:
        now = time.time()

        mem = _mem.get(key)
        if mem and now - mem["ts"] <= ttl:
            _stats["hits"] += 1
            _stats["mem_hits"] += 1
            return mem["data"]

        if redis_active():
            client = get_redis_client()
            if client:
                try:
                    raw = client.get(_redis_key(key))
                    if raw:
                        parsed = _deserialize(raw)
                        if parsed and now - parsed[0] <= ttl:
                            _mem[key] = {"ts": parsed[0], "data": parsed[1]}
                            _stats["hits"] += 1
                            _stats["redis_hits"] += 1
                            return parsed[1]
                except Exception as exc:
                    _stats["errors"] += 1
                    _log.debug("Redis get failed for %s: %s", key, exc)

        if _disk_enabled():
            path = _disk_path(key)
            if path.exists():
                try:
                    raw = path.read_text(encoding="utf-8")
                    parsed = _deserialize(raw)
                    if parsed and now - parsed[0] <= ttl:
                        _mem[key] = {"ts": parsed[0], "data": parsed[1]}
                        _stats["hits"] += 1
                        _stats["disk_hits"] += 1
                        return parsed[1]
                except OSError:
                    pass

        _stats["misses"] += 1
        return None

    def set(self, key: str, data: Any, *, ttl: int = DEFAULT_TTL) -> None:
        ts = time.time()
        _mem[key] = {"ts": ts, "data": data}
        _stats["sets"] += 1

        payload = _serialize(data)

        if redis_active():
            client = get_redis_client()
            if client:
                try:
                    client.setex(_redis_key(key), max(int(ttl), 1), payload)
                except Exception as exc:
                    _stats["errors"] += 1
                    _log.debug("Redis set failed for %s: %s", key, exc)

        if _disk_enabled():
            path = _disk_path(key)
            tmp = path.with_suffix(".tmp")
            try:
                CACHE_DIR.mkdir(parents=True, exist_ok=True)
                tmp.write_text(payload, encoding="utf-8")
                tmp.replace(path)
            except OSError:
                global _disk_ok
                _disk_ok = False

    def delete(self, key: str) -> None:
        _mem.pop(key, None)
        if redis_active():
            client = get_redis_client()
            if client:
                try:
                    client.delete(_redis_key(key))
                except Exception:
                    _stats["errors"] += 1
        if _disk_enabled():
            try:
                _disk_path(key).unlink(missing_ok=True)
            except OSError:
                pass

    def invalidate_prefix(self, prefix: str) -> int:
        """Delete keys matching a logical prefix (Redis SCAN; disk clears all if broad)."""
        count = 0
        full_prefix = prefix if prefix.startswith(KEY_PREFIX) else f"{KEY_PREFIX}:{prefix}"

        keys_to_drop = [k for k in _mem if k.startswith(prefix) or k.startswith(full_prefix.replace(f"{KEY_PREFIX}:", ""))]
        for k in keys_to_drop:
            _mem.pop(k, None)
            count += 1

        if redis_active():
            client = get_redis_client()
            if client:
                try:
                    cursor = 0
                    while True:
                        cursor, batch = client.scan(cursor=cursor, match=f"{full_prefix}*", count=200)
                        if batch:
                            client.delete(*batch)
                            count += len(batch)
                        if cursor == 0:
                            break
                except Exception as exc:
                    _stats["errors"] += 1
                    _log.debug("Redis prefix invalidate failed: %s", exc)

        return count

    def get_or_fetch(
        self,
        key: str,
        fetcher: Callable[[], Any],
        *,
        ttl: int = DEFAULT_TTL,
        refresh: bool = False,
        stale_ttl: int | None = None,
    ) -> Any:
        if not refresh:
            cached = self.get(key, ttl=ttl)
            if cached is not None:
                return cached

        _stats["fetches"] += 1
        try:
            data = fetcher()
            self.set(key, data, ttl=ttl)
            return data
        except Exception:
            stale_window = stale_ttl or (ttl * STALE_TTL_MULTIPLIER)
            stale = self.get(key, ttl=stale_window)
            if stale is not None:
                return stale
            raise

    def clear_all(self) -> None:
        """Clear memory, disk files, and Redis keys under KEY_PREFIX."""
        _mem.clear()
        if _disk_enabled() and CACHE_DIR.exists():
            for p in CACHE_DIR.glob("*.json"):
                try:
                    p.unlink()
                except OSError:
                    pass
        if redis_active():
            client = get_redis_client()
            if client:
                try:
                    cursor = 0
                    pattern = f"{KEY_PREFIX}:*"
                    while True:
                        cursor, batch = client.scan(cursor=cursor, match=pattern, count=200)
                        if batch:
                            client.delete(*batch)
                        if cursor == 0:
                            break
                except Exception as exc:
                    _stats["errors"] += 1
                    _log.debug("Redis clear_all failed: %s", exc)

    def stats(self) -> dict[str, Any]:
        total = _stats["hits"] + _stats["misses"]
        return {
            **_stats,
            "hitRate": round(_stats["hits"] / total, 4) if total else 0.0,
            "redisConnected": redis_connected(),
            "redisEnabled": redis_active(),
            "diskEnabled": _disk_enabled(),
            "keyPrefix": KEY_PREFIX,
            "cacheDir": str(CACHE_DIR),
        }


_service: CacheService | None = None


def get_cache_service() -> CacheService:
    global _service
    if _service is None:
        _service = CacheService()
    return _service


def reset_stats() -> None:
    for k in _stats:
        _stats[k] = 0