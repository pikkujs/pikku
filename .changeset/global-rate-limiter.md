---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/skills': patch
---

Add `addGlobalRateLimiter({ limit, windowMs, ipHeader?, onStoreError? })` to `@pikku/core/middleware`, which limits every external HTTP route and MCP tool per caller. A function's own `rateLimit` replaces the global limit, `rateLimit: false` exempts it, and a `wireHTTP` route can carry its own, which wins. `trustedProxies` says how many entries of a forwarded list your proxies appended; the list is read from the right. The generated unit-to-unit routes (`/mesh/rpc/:rpcName`, `/__pikku/queue-job`, `/__pikku/scheduler-job`) are exempt. Internal rpc, queue and workflow calls are never counted. The check runs before auth and validation and answers 429 with `Retry-After`; a limit with no `rateLimitService` answers 500, and a failing store answers 503 unless `onStoreError` is `'allow'`. `TooManyRequestsError` carries an MCP error code. The skills no longer document a `rateLimit` middleware that never existed.
