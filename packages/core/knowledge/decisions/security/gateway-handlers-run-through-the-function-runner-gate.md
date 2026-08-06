---
type: decision
title: Gateway handlers run through the function runner gate
description: A gateway's handler is registered as a real pikku function and invoked via runPikkuFunc, because calling it directly skips auth, scopes and permissions
tags: gateway
---

# Gateway handlers run through the function runner gate

`registerGatewayHandler` in
`packages/core/src/wirings/gateway/gateway-runner.ts` registers `config.func`
under a synthetic function id (`gateway__<name>__handler`) and every transport —
webhook POST, websocket message, listener callback — invokes it via
`runPikkuFunc`. This looks like an unnecessary indirection: the handler is right
there in the config and could be awaited directly. It cannot. The function
runner's gate is the only thing that evaluates a function's declared `auth`,
`scopes` and `permissions`; a direct call runs the handler with none of them
checked.

The synthetic registration **inherits the wired function's own metadata** —
`sessionless`, input and output schema names, `scopes`, tag middleware — read
back from `pikkuState(null, 'gateway', 'meta')[name].pikkuFuncId`, which the
inspector already records. The synthetic id exists so the gate runs; it is not a
licence to run the handler under metadata its author never wrote. A handler
declared with `pikkuFunc` says session-required in meta rather than through an
`auth` property, and that declaration is honoured.

When nothing was declared — no inspector entry, as when a gateway is wired by
hand — the handler falls back to `sessionless: true`. Gateway inbound traffic is
authenticated by the platform adapter (webhook signature verification, platform
tokens), not by a user session, so defaulting to session-required would reject
every legitimate webhook. `CoreGateway.auth` and the handler's own `auth: true`
opt back into requiring a session. `scopes` and `permissions` are enforced
whenever declared, session or not.

**What this rules out:** invoking `config.func` directly from any gateway
transport as an optimisation, and "simplifying" the synthetic function
registration away. It also rules out fabricating the handler's metadata rather
than inheriting it, and flipping the _fallback_ to session-required as a
hardening measure — that breaks every webhook that declared nothing, rather than
securing it; require auth per gateway via `CoreGateway.auth` instead.
