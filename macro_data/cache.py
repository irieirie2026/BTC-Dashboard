"""Backward-compatible cache API — delegates to cache.service.CacheService.

Existing call sites (cache_get / cache_set) gain Redis automatically.
"""

from __future__ import annotations

from typing import Any

from cache.config import DEFAULT_TTL
from cache.service import get_cache_service

# Re-export for modules that import CACHE_DIR
from cache.service import CACHE_DIR  # noqa: F401


def cache_get(key: str, *, ttl: int = DEFAULT_TTL) -> Any | None:
    return get_cache_service().get(key, ttl=ttl)


def cache_set(key: str, data: Any, *, ttl: int | None = None) -> None:
    get_cache_service().set(key, data, ttl=ttl or DEFAULT_TTL)


def clear_cache() -> None:
    get_cache_service().clear_all()