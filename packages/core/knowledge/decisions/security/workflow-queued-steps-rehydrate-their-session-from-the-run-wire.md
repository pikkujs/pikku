---
type: decision
title: A queued workflow step rehydrates its session from the persisted run wire
description: The queue job payload is just `{ runId }`, so without threading `pikkuUserId` an authed step sees no session and throws
tags: workflow
---

# A queued workflow step rehydrates its session from the persisted run wire

A queued workflow step is executed with the bare job wire — the payload is just
`{ runId }` (or `{ runId, stepName, rpcName, data, fromStepName }`) — so it
carries no `pikkuUserId`. `invokeStepRpc` in `pikku-workflow-service.ts`
therefore merges the run's own `wire.pikkuUserId` into the step wire override
before calling `rpcWithWire`. Without it, a step written as an authed
`pikkuFunc` sees no session and fails with "Authentication required" on the
queued path while passing inline, which is the worst possible split: it looks
like a transport bug rather than an auth one.

`invokeStepRpc` is shared by the queue executor and the inline executor
precisely so the two cannot drift. The only thing that differs between
transports is who calls it, not the call itself. `createWorkflowWire` and
`runWorkflowJobInner` propagate the same `pikkuUserId` onto the workflow wire
for the workflow body.

The user id is the only identity carried. It is a reference for credential
resolution, not a serialized session — the session itself is rehydrated on the
far side.

**What this rules out:** giving the queued path its own invocation helper,
dropping the `pikkuUserId` merge because "the wire already has a session"
inline, or widening the run wire to persist session tokens instead of a user id
reference.
