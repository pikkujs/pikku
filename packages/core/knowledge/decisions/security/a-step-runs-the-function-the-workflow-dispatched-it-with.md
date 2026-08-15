---
type: decision
title: A step runs the function the workflow dispatched it with
description: StepState records the step's function name so the worker can reject a queue message naming a different one, because the step executes under the run owner's identity
tags: workflow
---

# A step runs the function the workflow dispatched it with

`pikkuWorkflowStepWorker` (`workflow-queue-workers.ts`) takes `rpcName` straight
off the queue message and hands it to `executeWorkflowStep`. That call runs as
the run's owner — `invokeStepRpc` copies `run.wire.pikkuUserId` onto the wire —
and `rpcWithWire` does not apply the `expose` gate that the public `/rpc` route
applies. So the message decided both _what_ ran and _as whom_.

The claim in `executeWorkflowStepInner` read the step's status and nothing else;
there was no stored function name to compare against. `StepState` now carries
`rpcName`, written by `insertStepState` (which already received it) and returned
by every backend, and the claim rejects a message naming anything else with
`WorkflowStepFunctionMismatchError` — before any status is mutated, so a forged
message leaves the run untouched. The graph path takes the same value from
`nodes[nodeId].rpcName` rather than from the message.

`rpcName: undefined` means a store that never recorded one and cannot be
compared; `null` is a step with no function of its own. Only a recorded value is
checked.

**Reachability, stated plainly:** the step-worker queue is not reachable from the
public `/rpc/:rpcName` route — the worker is registered without `expose`. The
exposure this closes is write access to the queue backend, and any in-process
caller reaching `executeWorkflowStep` directly.

**What this rules out:** trusting a queue payload to name the function it
executes, here or in any future worker, and dropping `rpcName` from `StepState`
as redundant with the step data — the comparison is the only thing standing
between queue-write access and running any registered function as the run's
owner.
