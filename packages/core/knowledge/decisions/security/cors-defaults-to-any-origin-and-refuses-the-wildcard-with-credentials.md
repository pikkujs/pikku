---
type: decision
title: CORS defaults to any origin and refuses the wildcard when credentials are on
description: The cors middleware's origin defaults to *, and a resolved wildcard origin combined with credentials throws when the middleware is built
tags: core, middleware, cors, security
---

# CORS defaults to any origin and refuses the wildcard when credentials are on

In `packages/core/src/middleware/cors.ts`, `origin` defaults to `'*'` (`:29`) and
`credentials` defaults to `false` (`:33`). The factory throws when the resolved
origin is `'*'` and credentials are on (`:36-40`). Because the check runs on the
resolved value, the default origin with `credentials: true` throws too.

A `true` origin reflects the request's own origin, or `*` when none is sent
(`:55-56`). An array origin answers with the request origin only when it is in the
list (`:57-61`). Any other request origin is left out of the response, with a debug
log (`:62-65`).

**What this rules out:** a wildcard origin together with credentials.
`questions/does-cors-origin-true-reflect-any-origin-with-credentials.md` records
the `true` case, which this check does not refuse.
