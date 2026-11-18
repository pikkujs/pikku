---
'@pikku/core': patch
'@pikku/skills': patch
---

Add `addGlobalRateLimiter({ limit, windowMs, ipHeader?, onStoreError? })` to `@pikku/core/middleware`, which limits every external HTTP route and MCP tool per caller. A function's own `rateLimit` replaces the global limit, and `rateLimit: false` exempts it. Internal rpc, queue and workflow calls are never counted. The check runs before auth and validation and answers 429 with `Retry-After`; a limit with no `rateLimitService` answers 500, and a failing store answers 503 unless `onStoreError` is `'allow'`. `TooManyRequestsError` carries an MCP error code. The skills no longer document a `rateLimit` middleware that never existed.
