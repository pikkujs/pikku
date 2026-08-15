---
type: decision
title: Gateway middleware sessions must be bridged onto the wire
description: Gateway middleware calling wire.setSession writes to a session service the handler's invocation never reads, so the session is copied onto wire.session before the gate runs
tags: gateway
---

# Gateway middleware sessions must be bridged onto the wire

`bridgeMiddlewareSession` in
`packages/core/src/wirings/gateway/gateway-runner.ts` runs immediately before
every `runPikkuFunc` call in the gateway runner, copying `await wire.getSession()`
onto `wire.session` when the latter is unset. Gateway middleware is the only
place a webhook can acquire a session at all — typically by mapping a verified
platform sender id to a user. Middleware that assigns `wire.session` directly
needs no help, but the idiomatic `wire.setSession()` writes into the _enclosing
wiring's_ session service, and the handler's own invocation does not read that
service.

Without the bridge, the failure mode is silent and it fails open in the way that
matters: `auth` and `scopes` on the handler see no session, so a gateway whose
middleware successfully authenticated the sender still evaluates its gate as
unauthenticated. Nothing throws; the session is simply invisible.

**What this rules out:** removing the `bridgeMiddlewareSession` call from any of
the three transports (webhook POST, websocket message, listener) on the grounds
that middleware "already set the session", and adding a fourth gateway transport
that calls `runPikkuFunc` without bridging first. It also rules out relying on
`wire.setSession()` alone anywhere the callee is a separately-registered pikku
function.
