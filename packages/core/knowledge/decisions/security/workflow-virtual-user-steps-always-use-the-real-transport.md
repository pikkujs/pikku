---
type: decision
title: A scenario virtual user step always goes over the real transport and never through internal dispatch
description: Internal dispatch would bypass auth middleware and permissions, turning a scenario into a green health check that proves nothing
tags: workflow
---

# A scenario virtual user step always goes over the real transport and never through internal dispatch

When a workflow step carries `options.virtualUser`, `rpcStep` in
`pikku-workflow-service.ts` calls `virtualUser.invoke(rpcName, data)` — the virtual user's
authenticated client, over the real network transport — and never falls back to
internal dispatch. Internal dispatch skips auth middleware and permission
checks, so a scenario that "passed" that way would prove only that the function
body runs, not that the virtual user is allowed to run it. That is a green health
check for a system that may be wide open.

For the same reason, virtual user steps never queue: `rpcStep` short-circuits
`dispatchStep` to `false` whenever `options.virtualUser` is set. A virtual user step is an
outbound HTTP call made by the runner itself, and the virtual user's session lives in
this process — a queued worker in another process would have no session to make
it with. The step is still recorded durably like any RPC step, so replay and
reporting are unaffected.

Virtual user identity is process-local by nature. `PikkuScenarioService.runVirtualUsers` maps
run id to live authenticated clients (cookie jars), and those ride that map
only, never the persisted run wire — a serialized session on a durable run row
would be a credential at rest.

**What this rules out:** adding an "internal dispatch is faster" fast path for
virtual user steps, routing a virtual user step through the queue, serializing virtual user sessions
onto the run wire, or letting `virtualUser.invoke` degrade to `rpcWithWire` when the
transport is unavailable. Each turns an end-to-end authorization test into one
that cannot fail.
