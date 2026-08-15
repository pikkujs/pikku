---
type: decision
title: A virtual user run is not a workflow and not a queued job
description: runVirtualUser writes its record, dispatches the run without awaiting it, and returns the id — because an exploratory run has nothing to replay and the record already carries what a queue would be holding
tags: virtual-user, storage
---

# A virtual user run is not a workflow and not a queued job

`runVirtualUser` — the RPC `scaffold.virtualUser` generates — does three things
in order: writes a `VirtualUserRunStore` record, dispatches
`executeVirtualUserRun` **without awaiting it**, and returns the `runId`. There
is no workflow, no queue, and no worker.

Both of the alternatives are the obvious ones, and both are wrong for this.

**A workflow** is a replayable step graph: its value is that a run can be
resumed at the step it died on, and that the same input reaches the same step.
A virtual user is the opposite by construction — it is an LLM deciding what to
try next, so no two attempts take the same steps, and there is no step to resume
_to_. Recording a run as a workflow puts entries in the workflow store that can
never be replayed, and gives every operator reading that store a row that lies
about what it is. The seed makes a run _reproducible_ — run it again and it
explores the same way — which is a different property from resumable, and one
the record already carries.

**A queue** buys durability across a restart and a retry on failure. It costs a
broker dependency in every application that turns the scaffold on, plus a worker
whose progress cannot be read anyway: the run's state lives in the store, not in
the queue entry. The queue would be holding a copy of what the record already
has, on the way to the same place.

So the record is the run's only trace, and that is what `VirtualUserRunStore`
exists for. It is also why `fail()` is a method rather than an absence: a run
that crashed and a run that found nothing are different answers, and a record
left at `running` is neither.

The cost is real and is stated on the type: **a restart mid-run strands a record
at `running` with nothing left to finish it.** A run older than its budget
window and still `running` is dead, not working — that is a read-side rule, and
it is cheaper than the two dependencies avoided. Nothing retries; a stranded run
is started again, with its seed if the caller wants the same exploration.

**What this rules out:** dispatching the run through `startWorkflow`; a
scaffolded queue worker; awaiting the engine inside the request (a run takes
minutes and survives neither a rollout nor a proxy timeout); and inferring
`status` from `finishedAt` being unset, which cannot separate a crash from a run
still going.
