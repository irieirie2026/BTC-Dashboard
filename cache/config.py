"""Redis and TTL configuration — env-driven."""

from __future__ import annotations

import os

# Key namespace prefix (all Redis / logical keys)
KEY_PREFIX = os.environ.get("CACHE_KEY_PREFIX", "btc-dash").strip() or "btc-dash"

# auto | redis | disk | memory
BACKEND = os.environ.get("CACHE_BACKEND", "auto").strip().lower() or "auto"

REDIS_URL = os.environ.get("REDIS_URL", "").strip()
REDIS_ENABLED = os.environ.get("REDIS_ENABLED", "").strip().lower() in ("1", "true", "yes")
REDIS_SOCKET_TIMEOUT = float(os.environ.get("REDIS_SOCKET_TIMEOUT", "2.5"))
REDIS_MAX_CONNECTIONS = int(os.environ.get("REDIS_MAX_CONNECTIONS", "20"))

_DEFAULT_DAYS = int(os.environ.get("BTC_MACRO_CACHE_DAYS", "3"))
DEFAULT_TTL = _DEFAULT_DAYS * 24 * 3600

# TTL profiles (seconds) — override via env
TTL_HOT = int(os.environ.get("CACHE_TTL_HOT", "300"))          # 5 min
TTL_WARM = int(os.environ.get("CACHE_TTL_WARM", "3600"))       # 1 h
TTL_COLD = int(os.environ.get("CACHE_TTL_COLD", str(6 * 3600)))  # 6 h
TTL_MACRO = int(os.environ.get("CACHE_TTL_MACRO", str(24 * 3600)))  # 24 h
TTL_STATIC = int(os.environ.get("CACHE_TTL_STATIC", str(7 * 24 * 3600)))  # 7 d

# Hierarchy merged store is expensive to rebuild
HIERARCHY_STORE_TTL = int(os.environ.get("CACHE_HIERARCHY_TTL", str(TTL_COLD)))

# Stale multiplier for serve-stale-on-error (rate-limited APIs)
STALE_TTL_MULTIPLIER = int(os.environ.get("CACHE_STALE_MULTIPLIER", "7"))


def redis_active() -> bool:
    if BACKEND == "disk" or BACKEND == "memory":
        return False
    if BACKEND == "redis":
        return bool(REDIS_URL)
    # auto
    return bool(REDIS_URL) and (REDIS_ENABLED or bool(os.environ.get("VERCEL")))