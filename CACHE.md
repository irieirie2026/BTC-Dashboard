# Redis caching layer

Shared cache for macro data, Bitcoin indicators, and API bundles. **Redis is optional** — the app falls back to disk (`.cache/macro/`) and process memory when Redis is unavailable.

## Architecture

```
Fetcher / API payload
        ↓
cache.service.CacheService
   ├─ L1 Redis (shared across instances)
   ├─ L2 Disk JSON (.cache/macro or /tmp on Vercel)
   └─ L3 Process memory (per request / warm instance)
```

`macro_data/cache.py` remains the compatibility shim — existing `cache_get` / `cache_set` calls automatically use Redis.

Bitcoin time-series use **write-through**: `data/btc-series/*.json` (durable) + Redis key `btc-dash:btc:series:{metric_id}` (fast reads).

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | — | Redis connection URL (`redis://localhost:6379/0` or Upstash `rediss://…`) |
| `REDIS_ENABLED` | `0` | Set `1` to use Redis locally (auto-enabled on Vercel when `REDIS_URL` is set) |
| `CACHE_BACKEND` | `auto` | `auto` \| `redis` \| `disk` \| `memory` |
| `CACHE_KEY_PREFIX` | `btc-dash` | Namespace prefix for all Redis keys |
| `BTC_MACRO_CACHE_DIR` | `.cache/macro` | Disk fallback directory |
| `BTC_MACRO_CACHE_DAYS` | `3` | Default TTL for legacy macro keys (days) |
| `CACHE_TTL_HOT` | `300` | 5 min — live fees, snapshots |
| `CACHE_TTL_WARM` | `3600` | 1 h — API bundles |
| `CACHE_TTL_COLD` | `21600` | 6 h — WB/IMF/DBnomics, liquidity |
| `CACHE_TTL_MACRO` | `86400` | 24 h — BGeometrics series |
| `CACHE_HIERARCHY_TTL` | `21600` | Merged macro hierarchy store |

## Local development

```bash
docker run -d --name btc-redis -p 6379:6379 redis:7-alpine
pip install -r requirements.txt
```

`.env.local`:

```env
REDIS_URL=redis://localhost:6379/0
REDIS_ENABLED=1
CACHE_BACKEND=auto
```

## Vercel / Upstash

1. Create an Upstash Redis database.
2. Add `REDIS_URL` (TLS `rediss://…`) to Vercel project env.
3. Deploy — `CACHE_BACKEND=auto` enables Redis when `REDIS_URL` is present on Vercel.

## Usage

### Existing code (no changes required)

```python
from macro_data.cache import cache_get, cache_set

cached = cache_get("wb:countries")
if cached is None:
    data = fetch_from_worldbank()
    cache_set("wb:countries", data)
```

### Cache-aside helper

```python
from cache.service import get_cache_service
from cache.config import TTL_COLD

svc = get_cache_service()
data = svc.get_or_fetch(
    "macro:wb:indicator:NY.GDP.MKTP.KD.ZG:1960:2026",
    lambda: fetch_indicator(...),
    ttl=TTL_COLD,
    refresh=refresh,
    stale_ttl=TTL_COLD * 7,  # serve stale on fetch error
)
```

### Key builders

```python
from cache.keys import btc_series, macro_hierarchy_store, macro_global_payload

key = btc_series("sth_mvrv")
key = macro_hierarchy_store()
key = macro_global_payload("auto")
```

### Invalidation

- API: `?refresh=1` on macro/BTC routes clears domain caches.
- Programmatic: `get_cache_service().invalidate_prefix("btc:bundle:")`
- Full flush: `from macro_data.cache import clear_cache` → `clear_cache()`

### Monitoring

```bash
curl http://localhost:8080/api/cache/stats
curl 'http://localhost:8080/api/cache/stats?reset=1'  # reset counters
```

Response includes `hits`, `misses`, `hitRate`, `redisConnected`, `redis_hits`, `disk_hits`.

## Caching patterns

| Pattern | Where |
|---------|--------|
| **Cache-aside** | WB, IMF, DBnomics, fetchers (default `cache_get` → fetch → `cache_set`) |
| **Write-through** | `btc_data/store.write_series` → disk + Redis |
| **Stale-while-revalidate** | `get_or_fetch(stale_ttl=…)`; BGeometrics fetchers serve extended stale on 429 |
| **Background refresh** | `btc_data/scheduler.py` prefetch → disk + Redis |
| **TTL invalidation** | Per-key TTL on get; `?refresh=1` for manual bust |

## Phase D — Legacy routes (server.py + equity)

All former in-process `_cache` dicts in `server.py` and `equity_insights.py` now use `cache/legacy.py` under the `legacy:` prefix.

| Route | Cache key pattern | TTL |
|-------|-------------------|-----|
| `/api/etf` | `legacy:scrape:holdings`, `flows` | 15 min |
| `/api/treasury` | `legacy:scrape:treasury` | 15 min |
| `/api/stats/btc-history` | `legacy:stats:btc-history` | 6 h (+ disk seed) |
| `/api/equity/*` | `legacy:equity:…` | 5 min |
| `/api/tradfi/*` | `legacy:tradfi:…` | 15 min |
| `/api/macro/{section}` | `legacy:macro:…` | 3 days |
| `/api/defi/*`, `/api/exchanges/*`, `/api/news/*` | `legacy:defi:…` etc. | 15 min |
| Fear & Greed | `legacy:misc:fear-greed` | 4 h |

Bust cache on any of the above with `?refresh=1`.

Invalidate all legacy keys:

```bash
curl 'http://localhost:8080/api/cache/stats?prefix=legacy:&refresh=1'
```

## TTL quick reference

| Data | TTL profile | Typical duration |
|------|-------------|------------------|
| Mempool / Blockchair | HOT | 5–15 min |
| BTC API bundles | WARM | 1 h |
| Global macro payload | WARM | 1 h |
| WB / IMF / DBnomics rows | COLD / default | 6 h – 3 d |
| BGeometrics series | MACRO | 24 h |
| Hierarchy merged store | HIERARCHY | 6 h |
| Country catalog | STATIC | 7 d |