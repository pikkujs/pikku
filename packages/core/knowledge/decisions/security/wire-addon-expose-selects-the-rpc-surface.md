---
type: decision
title: wireAddon expose opts in to the RPC surface, and can only narrow it
description: Nothing in an addon is reachable through rpc.exposed until the consuming app's wireAddon or wireRemoteAddon sets expose — true opens what the addon declared exposed, a list narrows that — and a remote-addon call is held to the host's remote contract
tags: addon, rpc, expose, authorization, remote
---

# wireAddon expose opts in to the RPC surface, and can only narrow it

`rpc.exposed('<name>:<fn>')` is what the generated `POST /rpc/:rpcName`
forwards to. Two parties have a say in whether an addon function answers it:
the addon author, who marks a function `expose: true`, and the app installing
the addon, through `expose` on its `wireAddon` (or `wireRemoteAddon`). Both have
to agree. `isAddonFunctionExposed` resolves it per instance:

- **unset or `false`** — nothing in this instance is reachable through
  `rpc.exposed`. Installing an addon never adds a public route by itself.
- **`true`** — every function the addon declared `expose: true`.
- **a list** — those of the named functions the addon declared `expose: true`.
  The generated `#pikku/addon` types the list against the package's function
  names. A name the package does not publish, or publishes without
  `expose: true`, fails the build with PKU343 rather than being dropped
  silently. The value has to be written inline (`true`, `false` or an array of
  string literals): the build reads it statically, and a variable or spread
  fails it with PKU344 rather than being read as unset, which would leave the
  deploy units disagreeing with the runtime.

The default used to be the other way round: unset meant the addon's own
declarations, and a list could open functions the author never declared. That
let installing an addon publish its routes unasked, and let an app reach an
internal helper the author never designed to face a caller. An addon author's
`expose: true` now only says "safe to put on a public route"; the app decides
whether it does.

The decision is per **instance**, not per package: two `wireAddon` calls for one
package may expose different things, and the gate reads the config the
namespace resolved to.

## Remote addons

A `wireRemoteAddon` instance has no local function meta to consult, so the
consumer treats every contract function as declared exposed and applies the
wiring's `expose` alone. `rpc.exposed` forwards an allowed call through the
same `rpc('<name>:<fn>')` path server-side code uses, after the caller's
`addonMayReach` check, so an addon calling `/rpc` reaches a remote addon only
through its `uses`.

The host enforces its side. Every remote-addon call carries
`x-pikku-remote-contract` (`REMOTE_CONTRACT_HEADER`), and a host's
`rpc.exposed` that sees it answers only functions that are `expose: true` and
`remote: true`, and refuses a name it has no local meta for instead of
forwarding it. A consumer's token is meant for the addon's contract; without
the header it would reach every exposed function on the host. The header only
ever narrows what the host answers, so a caller gains nothing by sending it and
loses nothing it was allowed by leaving it off — leaving it off just means the
host treats the call as an ordinary `/rpc` call.

## Deploy units

The deploy analyzer's per-addon unit applies the same rule, since that unit is
what the dispatcher can forward to. A function the wiring refuses gets no unit
and no dispatch entry, so the `deploymentService` fallback in `rpc.exposed` —
which forwards namespaced names with no local metadata — has nothing to reach.
Where the dispatcher does hold the wiring, it also refuses locally before
forwarding.

`expose` is reachability, not authorization. A listed function still runs
through `runPikkuFunc` with its own `auth`, permissions and the instance's
`auth`/`scopes`/`tags` — see
[addon auth and tags](./addon-auth-and-tags-only-tighten.md). Exposing a
sessionless function makes it public unless one of those gates it, which is why
the "exposed function has no gate" warning is raised in the app that opted in,
not in the addon's own build.

**What this rules out:** an addon reaching `/rpc` because it was installed; a
wiring list opening a function its author did not declare exposed; treating an
unknown list entry as a silent no-op; a remote-addon token reaching host
functions outside the remote contract; and a deploy unit that carries functions
the runtime gate would refuse.
