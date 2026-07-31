---
type: decision
title: HTTP error detail is withheld from clients in production
description: 5xx bodies carry only a trace id in production; exposeErrors can widen that in development but never in production
tags: http
---

# HTTP error detail is withheld from clients in production

`fetchData` in `packages/core/src/wirings/http/http-runner.ts` defaults
`exposeErrors` to `!isProduction()`, and `handleHTTPError` in
`packages/core/src/handle-error.ts` computes `clientFacing` as
`errorResponse.status < 500 || (exposeErrors && !isProduction())`. Registered
errors below 500 always return their own message and `payload`, because they
describe something the caller did. Anything 500 and above returns only the
registered generic message and the `errorId` trace id; the original `e.message`,
`e.stack` and `payload` are dropped. The unregistered-error path is stricter
still — it emits `{ errorId }` alone and attaches `message`/`stack` only when
`exposeErrors && !isProduction()`.

Unexpected 5xx messages are the ones that leak: driver errors carrying
connection strings, ORM errors quoting rows, assertion text naming internal
services. The trace id is the deliberate substitute — the operator correlates it
with the logged error, which does carry the full message.

Note the double gate. `exposeErrors` is re-checked against `isProduction()`
inside `handleHTTPError` even though its default already accounts for it, so a
runtime that passes `exposeErrors: true` explicitly still cannot open up a
production deployment.

**What this rules out:** collapsing the two `isProduction()` checks into the
default value, letting a caller-supplied `exposeErrors` win in production, and
"improving" the 5xx body by echoing `e.message` unconditionally.
