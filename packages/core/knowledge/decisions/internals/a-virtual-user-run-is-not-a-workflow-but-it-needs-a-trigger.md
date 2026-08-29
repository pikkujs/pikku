---
type: decision
title: A virtual user run is not a workflow, but it needs a trigger
description: runVirtualUser writes its record and dispatches the run onto a queue at one attempt — an exploratory run has nothing to replay, but a deployment that puts each function in its own unit has nothing to fire it either
tags: virtual-user, storage, deploy
---

# A virtual user run is not a workflow, but it needs a trigger

`runVirtualUser` — the RPC `scaffold.virtualUser` generates — does three things
in order: writes a `VirtualUserRunStore` record, dispatches
`executeVirtualUserRun`, and returns the `runId`. The request never waits for
the run; a run takes minutes and survives neither a rollout nor a proxy timeout.

**A workflow** is still the wrong shape, for the reason it always was. Its value
is that a run can be resumed at the step it died on, and that the same input
reaches the same step. A virtual user is the opposite by construction — it is an
LLM deciding what to try next, so no two attempts take the same steps, and there
is no step to resume _to_. Recording a run as a workflow puts entries in the
workflow store that can never be replayed, and gives every operator reading that
store a row that lies about what it is. The seed makes a run _reproducible_ —
run it again and it explores the same way — which is a different property from
resumable, and one the record already carries.

**A queue was rejected once, on durability, and that was the wrong question.**
The original reasoning weighed a broker dependency against a retry nobody wants,
and concluded the in-process dispatch was enough. It is enough in one process.
It is not a dispatch at all under a deployment that puts each function in its own
unit: there is no in-process promise to leave running, and `executeVirtualUserRun`
— sessionless, unexposed, wired to nothing — is not a function any unit can be
reached at. The RPC resolves to nothing, the rejection is swallowed by the
`catch` that exists to stop it taking the process down, and the run parks at
`running` with zero steps and no error anywhere. That is what a fabric stage did.

So the queue is not bought for durability. It is bought because **a trigger is
what makes a function deployable**: `wireQueueWorker` puts `executeVirtualUserRun`
in the manifest, which gives it a unit and gives the platform somewhere to
deliver to. The job is dispatched at `attempts: 1`, because a redelivery is a
second different outing writing into a record that already has an outcome — the
retry the queue offers is precisely the part that stays unused.

A project with no queue service keeps the in-process dispatch. That is not a
fallback that hides a failure: a project without a broker runs in one process,
where an unawaited promise is a real dispatch and the only correct one.

The record remains the run's only trace, and that is what `VirtualUserRunStore`
exists for. It is also why `fail()` is a method rather than an absence: a run
that crashed and a run that found nothing are different answers, and a record
left at `running` is neither.

The cost is smaller than it was but has not gone: **a restart mid-run strands a
record at `running` with nothing left to finish it**, since nothing retries. A
run older than its budget window and still `running` is dead, not working — a
read-side rule. A stranded run is started again, with its seed if the caller
wants the same exploration.

Where that rule is actually applied is
[the schedule tick](a-virtual-user-cadence-is-a-row-not-a-timer.md), which has
to: a record stuck at `running` would otherwise block its persona's cadence
forever.

**What this rules out:** dispatching the run through `startWorkflow`; awaiting
the engine inside the request; retrying a run that failed; storing the operator
token on the record rather than on the dispatch; and inferring `status` from
`finishedAt` being unset, which cannot separate a crash from a run still going.
