"""Redis and TTL configuration — env-driven."""

from __future__ import annotations

import os

def _env_number(name: str, default: int | float, cast):
    """Use the default when the env var is missing or blank."""
    raw = os.environ.get(name)
    if raw is None:
        return cast(default)
    text = str(raw).strip()
    if not text:
        return cast(default)
    try:
        return cast(text)
    except (TypeError, ValueError):
        return cast(default)


# Key namespace prefix (all Redis / logical keys)
KEY_PREFIX = os.environ.get("CACHE_KEY_PREFIX", "btc-dash").strip() or "btc-dash"

# auto | redis | disk | memory
BACKEND = os.environ.get("CACHE_BACKEND", "auto").strip().lower() or "auto"

REDIS_URL = os.environ.get("REDIS_URL", "").strip()
REDIS_ENABLED = os.environ.get("REDIS_ENABLED", "").strip().lower() in ("1", "true", "yes")
REDIS_SOCKET_TIMEOUT = _env_number("REDIS_SOCKET_TIMEOUT", 2.5, float)
REDIS_MAX_CONNECTIONS = _env_number("REDIS_MAX_CONNECTIONS", 20, int)

_DEFAULT_DAYS = _env_number("BTC_MACRO_CACHE_DAYS", 3, int)
DEFAULT_TTL = _DEFAULT_DAYS * 24 * 3600

# TTL profiles (seconds) — override via env
TTL_HOT = _env_number("CACHE_TTL_HOT", 300, int)          # 5 min
TTL_WARM = _env_number("CACHE_TTL_WARM", 3600, int)       # 1 h
TTL_COLD = _env_number("CACHE_TTL_COLD", 6 * 3600, int)  # 6 h
TTL_MACRO = _env_number("CACHE_TTL_MACRO", 24 * 3600, int)  # 24 h
TTL_STATIC = _env_number("CACHE_TTL_STATIC", 7 * 24 * 3600, int)  # 7 d

# Hierarchy merged store is expensive to rebuild
HIERARCHY_STORE_TTL = _env_number("CACHE_HIERARCHY_TTL", TTL_COLD, int)

# Stale multiplier for serve-stale-on-error (rate-limited APIs)
STALE_TTL_MULTIPLIER = _env_number("CACHE_STALE_MULTIPLIER", 7, int)


def redis_active() -> bool:
    if BACKEND == "disk" or BACKEND == "memory":
        return False
    if BACKEND == "redis":
        return bool(REDIS_URL)
    # auto
    return bool(REDIS_URL) and (REDIS_ENABLED or bool(os.environ.get("VERCEL")))