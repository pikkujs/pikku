---
'@pikku/core': patch
---

`cors()` takes an `exposeHeaders` option.

Without `Access-Control-Expose-Headers` a cross-origin caller can read only the
CORS-safelisted response headers, so any header the client is meant to act on was
invisible to it. The cross-site session relay in `@pikku/better-auth` is the case that
surfaced it: the client cannot read `x-pikku-cross-site-set-cookie` off a cross-origin
response without being told it may.

Defaults to none, so nothing new is exposed unless it is named.
