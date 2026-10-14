---
type: decision
title: Origin-locked routes accept only an exact origin match and refuse a missing one
description: requireOrigin rejects a request whose Origin, or Referer when Origin is absent, is not the host's own origin or a configured origin, compared by equality
tags: core, middleware, security
---

# Origin-locked routes accept only an exact origin match and refuse a missing one

`isAllowedOrigin` in `packages/core/src/middleware/require-origin.ts:25-33`
returns false when the request has no origin (`:30`). It then accepts only an
equal host origin (`:31`) or an equal configured origin after `toOrigin`
normalisation (`:32`). There is no suffix or prefix match.

The middleware takes `Origin` first and falls back to `Referer` (`:59-61`),
derives the host origin from `host` and `x-forwarded-proto`, which defaults to
`https` (`:63-65`), and throws `InvalidOriginError` when the check fails
(`:72-75`). The doc comment at `:36-42` says this is not CORS: it rejects before
the function runs, and a missing origin is rejected on purpose.

**What this rules out:** matching origins by suffix, and accepting a request that
carries neither `Origin` nor `Referer`.
