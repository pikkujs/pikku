---
type: decision
title: A workflow's wire is built from the run record, not from the RPC service
description: The RPC service exposes no wire, so every rpcService.wire read was undefined; the run record is the only thing that carries the caller across a step boundary
tags: core, workflow
---

# A workflow's wire is built from the run record, not from the RPC service

`PikkuWorkflowService` builds a fresh wire each time it runs a workflow body or
starts a child. For a while it filled parts of that wire from the RPC service it
had been handed:

```ts
session: rpcService?.wire?.session,
rpc: rpcService?.wire?.rpc,
pikkuUserId: rpcService.wire?.pikkuUserId,
```

`PikkuRPC` has no `wire`. Neither does the object `getContextRPCService`
actually returns — `ContextAwareRPCService` holds its wire *privately* and
exposes `invoke`, `remote`, `exposed`, `startWorkflow`, `agent` and
`rpcWithWire`, and nothing else. Every one of those reads was `undefined`, and
the `rpcService: any` parameter type is what kept the compiler quiet about it.

The consequence was silent and one-directional: a child workflow started from a
step never inherited the `pikkuUserId` its parent was running as, so a queued
child ran as nobody. Nothing failed — the field was simply absent, and the run
proceeded.

**The run record is the carrier.** `WorkflowRun.wire` is durable, is written
when the run is created, and survives the process boundary a queued step
crosses, which is exactly what a live service reference cannot do. Both the
run-body wire and the child-run wire now read `run.wire?.pikkuUserId`.

`session` and `rpc` are not copied at all. `runPikkuFunc` attaches `rpc` lazily
for the duration of an invocation and restores the previous descriptor
afterwards, and it resolves the session from the session store using
`pikkuUserId` — so both were being overwritten moments later anyway. The wire
these paths construct is a `PikkuRawWire` for that reason: it genuinely has no
`rpc` yet, and saying so is what let the dead reads be found.

**What this rules out:** reaching for the RPC service to answer "who is this
running as". It cannot answer, and the shape of the question hides that.
Anything a step needs to know about its caller has to be on the run.
