---
'@pikku/core': patch
---

`requireOrigin` now treats a loopback `Host` (`localhost`, `127.0.0.1`, `[::1]`) with no `X-Forwarded-Proto` as `http`, so same-origin requests to a plain-http dev server are no longer rejected with a 403; every other host still defaults to `https`. `@pikku/core/middleware` also exports `hostOriginOf` and `allowedOriginsFromVariables` (reads `CORS_ORIGINS`, else `FRONTEND_URL`, through the `variables` service).
