---
'@pikku/redis': patch
---

Add `RedisRateLimitService`, a `RateLimitService` on Redis. One Lua script counts and compares, so concurrent hits never admit more than the limit, and the window is the key's own TTL.
