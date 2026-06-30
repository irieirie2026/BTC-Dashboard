"""Lazy Redis connection pool with graceful degradation."""

from __future__ import annotations

import logging
from typing import Any

from cache.config import (
    REDIS_MAX_CONNECTIONS,
    REDIS_SOCKET_TIMEOUT,
    REDIS_URL,
    redis_active,
)

_log = logging.getLogger(__name__)

_pool: Any = None
_client: Any = None
_available: bool | None = None
_warned: bool = False


def _warn_once(msg: str) -> None:
    global _warned
    if not _warned:
        _log.warning(msg)
        _warned = True


def get_redis_client() -> Any | None:
    """Return a Redis client or None if unavailable."""
    global _pool, _client, _available

    if not redis_active() or not REDIS_URL:
        _available = False
        return None

    if _available is False:
        return None

    if _client is not None:
        return _client

    try:
        import redis  # type: ignore[import-untyped]
    except ImportError:
        _warn_once("redis package not installed — pip install redis")
        _available = False
        return None

    try:
        _pool = redis.ConnectionPool.from_url(
            REDIS_URL,
            max_connections=REDIS_MAX_CONNECTIONS,
            socket_timeout=REDIS_SOCKET_TIMEOUT,
            socket_connect_timeout=REDIS_SOCKET_TIMEOUT,
            decode_responses=True,
            health_check_interval=30,
        )
        _client = redis.Redis(connection_pool=_pool)
        _client.ping()
        _available = True
        return _client
    except Exception as exc:
        _warn_once(f"Redis unavailable ({exc}) — falling back to disk/memory cache")
        _available = False
        _client = None
        _pool = None
        return None


def redis_connected() -> bool:
    client = get_redis_client()
    if not client:
        return False
    try:
        client.ping()
        return True
    except Exception:
        return False


def reset_redis() -> None:
    global _pool, _client, _available, _warned
    _pool = None
    _client = None
    _available = None
    _warned = False