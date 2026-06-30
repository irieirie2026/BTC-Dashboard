"""Redis-backed caching layer with disk/memory fallback."""

from cache.config import (
    DEFAULT_TTL,
    HIERARCHY_STORE_TTL,
    TTL_COLD,
    TTL_HOT,
    TTL_MACRO,
    TTL_STATIC,
    TTL_WARM,
)
from cache.keys import (
    btc_bundle,
    btc_series,
    macro_global_payload,
    macro_hierarchy_store,
    macro_liquidity_map,
    macro_liquidity_payload,
)
from cache.legacy import clear_legacy_cache, legacy_cache_get, legacy_cache_set
from cache.service import CacheService, get_cache_service, reset_stats

__all__ = [
    "CacheService",
    "DEFAULT_TTL",
    "HIERARCHY_STORE_TTL",
    "TTL_COLD",
    "TTL_HOT",
    "TTL_MACRO",
    "TTL_STATIC",
    "TTL_WARM",
    "btc_bundle",
    "btc_series",
    "clear_legacy_cache",
    "get_cache_service",
    "legacy_cache_get",
    "legacy_cache_set",
    "macro_global_payload",
    "macro_hierarchy_store",
    "macro_liquidity_map",
    "macro_liquidity_payload",
    "reset_stats",
]