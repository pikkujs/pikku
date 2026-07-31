---
type: decision
title: A scenario actor step always goes over the real transport and never through internal dispatch
description: Internal dispatch would bypass auth middleware and permissions, turning a scenario into a green health check that proves nothing
tags: workflow
---

# A scenario actor step always goes over the real transport and never through internal dispatch

When a workflow step carries `options.actor`, `rpcStep` in
`pikku-workflow-service.ts` calls `actor.invoke(rpcName, data)` — the actor's
authenticated client, over the real network transport — and never falls back to
internal dispatch. Internal dispatch skips auth middleware and permission
checks, so a scenario that "passed" that way would prove only that the function
body runs, not that the persona is allowed to run it. That is a green health
check for a system that may be wide open.

For the same reason, actor steps never queue: `rpcStep` short-circuits
`dispatchStep` to `false` whenever `options.actor` is set. An actor step is an
outbound HTTP call made by the runner itself, and the actor's session lives in
this process — a queued worker in another process would have no session to make
it with. The step is still recorded durably like any RPC step, so replay and
reporting are unaffected.

Actor identity is process-local by nature. `PikkuScenarioService.runActors` maps
run id to live authenticated clients (cookie jars), and those ride that map
only, never the persisted run wire — a serialized session on a durable run row
would be a credential at rest.

**What this rules out:** adding an "internal dispatch is faster" fast path for
actor steps, routing an actor step through the queue, serializing actor sessions
onto the run wire, or letting `actor.invoke` degrade to `rpcWithWire` when the
transport is unavailable. Each turns an end-to-end authorization test into one
that cannot fail.
