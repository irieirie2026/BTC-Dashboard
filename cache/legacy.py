"""Legacy server.py / equity_insights cache — Redis-backed replacements for _cache dict."""

from __future__ import annotations

from typing import Any

from cache.service import get_cache_service

LEGACY_PREFIX = "legacy:"


def legacy_key(key: str) -> str:
    if key.startswith(LEGACY_PREFIX):
        return key
    return f"{LEGACY_PREFIX}{key}"


def legacy_cache_get(key: str, ttl: int, *, refresh: bool = False) -> Any | None:
    if refresh:
        return None
    from macro_data.cache import cache_get

    return cache_get(legacy_key(key), ttl=ttl)


def legacy_cache_set(key: str, data: Any, ttl: int) -> None:
    from macro_data.cache import cache_set

    cache_set(legacy_key(key), data, ttl=ttl)


def legacy_cache_delete(key: str) -> None:
    get_cache_service().delete(legacy_key(key))


def clear_legacy_cache(prefix: str = LEGACY_PREFIX) -> int:
    return get_cache_service().invalidate_prefix(prefix)