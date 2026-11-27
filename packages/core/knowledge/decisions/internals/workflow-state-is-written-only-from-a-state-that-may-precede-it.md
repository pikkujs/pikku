---
type: decision
title: Workflow state is written only from a state that may precede it
description: Run and step writes are compare-and-set in the store, so a writer acting on an old read is refused instead of undoing what happened since
tags: workflow, reliability
---

# Workflow state is written only from a state that may precede it

A pass reads a run, works, and writes. A cancel, another pass or a recovery sweep
can land between the two, and reading again just before the write only narrows
that window. So the store applies a write only when what it replaces may precede
it, and says whether it did.

## Runs

`transitionRunStatusImpl(id, from, status)` is the only run status write.
`updateRunStatus` takes its sources from `RUN_STATUS_SOURCES`. An unwind names its
own, because it is the one writer that may leave `compensating`, and only the
unwind of a cancel may leave `cancelled`: otherwise a step failing after a cancel
would rewrite why the run is unwinding.

A refused writer does not announce the outcome it did not write. It leaves the
parent to whoever did settle the run.

Each store makes the check and the write one operation: a `WHERE status IN` in
Kysely, a filtered update in MongoDB, a script in Redis. The in-memory service has
no await between the two. A Durable Object interleaves calls at every await, so it
runs its conditional writes one at a time.

## Steps

Every step write is checked against `STEP_SOURCES`, and against the attempt where
the writer has one. An outcome applies only to a `running` step. So a late write
from the very attempt that was failed as lost is refused, which a check on the
attempt number alone would let through. A refused outcome throws
`WorkflowStepSupersededError`. A refused `setStepScheduled` is silent, because it
means a worker claimed the step before the dispatcher got round to marking it.

Writers that settle a step nobody has to be running name `unsettled`: a sleep, a
refused step, a compensation row with no function of its own.

A child run in the parent's process records its outcome on the parent step as it
ends, before the engine that ran it does. `childStepRetryStore` and the queued
step's `record` accept that refusal. A Durable Object's step worker claims
nothing, so `recordDispatchedOutcome` marks the step running first. It names no
attempt, so a report from an older attempt can still land on a retry.

## A child is linked before it can start

`cancelRun` writes the parent `cancelled` and only then reads the parent's steps
to cancel their children. `startLinkedChildRun` writes the link in
`onRunCreated` and only then reads the parent. Whichever runs second sees what the
first wrote, so a cancel either finds the child or the child is cancelled before
it starts.

**What this rules out:** a run or step write that does not name its sources, and
starting a child run before its parent step names it.
