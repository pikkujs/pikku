---
'@pikku/core': patch
---

`fetchData` now defaults `exposeErrors` to `!isProduction()`, so a non-production HTTP server returns the error `message` and `stack` on unexpected 500s instead of a bare `{ errorId }`. A dev/sandbox RPC that 500s is now debuggable from the response alone; production (NODE_ENV=production) still returns only the errorId.
