---
type: decision
title: wireAddon expose selects the RPC surface, and a list may widen it
description: The consuming app decides which addon functions rpc.exposed reaches per instance — unset keeps the addon's own expose, false closes the instance, a list names exactly what is callable — and the deploy analyzer applies the same rule
tags: addon, rpc, expose, authorization
---

# wireAddon expose selects the RPC surface, and a list may widen it

`rpc.exposed('<name>:<fn>')` — what the generated `POST /rpc/:rpcName` forwards
to — used to consult only the addon's own `expose: true`. The app installing the
addon had no say: it could not close an addon whose author marked functions
exposed, and it could not open one the author had not. `mcp` already worked the
other way (the wiring decides), and the two now match.

`expose` on `wireAddon` is `boolean | string[]`, resolved per instance by
`isAddonFunctionExposed`:

- **unset or `true`** — the addon's declaration decides, as before. Keeping the
  default unchanged means no existing app gains or loses a route on upgrade.
- **`false`** — nothing in this instance is reachable through `rpc.exposed`.
- **a list** — exactly those functions, whether or not the addon declared them.
  The list can widen the addon's surface, the same power `mcp` has, because the
  app is the one that knows what its deployment should offer. The generated
  `#pikku/addon` types the list against the package's function names, and a name
  that survives to the build unpublished fails it with PKU343.
  The value has to be written inline (`true`, `false` or an array of string
  literals): the build reads it statically, and a variable or spread fails it
  with PKU344 rather than being read as unset, which would leave the deploy
  units disagreeing with the runtime.

The decision is per **instance**, not per package: two `wireAddon` calls for one
package may expose different things, and the gate reads the config the
namespace resolved to.

The deploy analyzer's per-addon unit applies the same rule, since that unit is
what the dispatcher can forward to. A function the wiring refuses gets no unit
and no dispatch entry, so the `deploymentService` fallback in `rpc.exposed` —
which forwards namespaced names with no local metadata — has nothing to reach.
Where the dispatcher does hold the wiring, it also refuses locally before
forwarding.

`expose` is reachability, not authorization. A listed function still runs
through `runPikkuFunc` with its own `auth`, permissions and the instance's
`auth`/`scopes`/`tags` — see
[addon auth and tags](./addon-auth-and-tags-only-tighten.md). Widening the list
to a sessionless function makes it public unless one of those gates it.

**What this rules out:** letting the addon's `expose: true` override a wiring's
`false`; treating an unknown list entry as a silent no-op; and a deploy unit
that carries functions the runtime gate would refuse.
