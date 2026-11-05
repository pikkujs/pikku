---
type: decision
title: A run belongs to its lease, not its process
description: Recovery after a crash or deploy asks the run's lease who owns a run, retries in-flight steps at least once, and re-arms sleeps from when they were scheduled
tags: core, workflow, reliability
---

# A run belongs to its lease, not its process

Steps and runs outlive the process working on them, but sleep timers, in-memory
queue jobs and an orchestration pass do not. So a kill or a deploy leaves durable
rows promising work that nothing is going to do. Recovery keeps those promises.
`workflowService.startRecovery()` runs a pass at startup and every 30s, and
`pikku dev` and `pikku serve` start it once they are serving. A host with no
long-lived process drives `recoverWorkflows()` from a scheduled task instead.
`workflow.recovery: false` turns it off.

## Ownership is the run lease

A sweep has to tell a dead instance's run from a live one's, and no process-local
state can. The run lease can: every pass holds `workflow-run:<id>`, renews it, and
leaves it to expire if it dies. So a sweep takes the lease before it touches a
run, and skips the run if it cannot. Skipping leaves no backoff behind, because a
run owned now may lose its owner by the next tick.

The cost is that a run killed mid-step waits up to the lease's 30s TTL.

`findStalledRunIds` no longer reads a null step lease as owned. It only meant that
for a step parked on a child run, so a `running` step counts as in flight only
under a live lease or with a `childRunId`. A step worked inside a pass has neither,
and the run lease answers for it.

## In-flight steps run at least once more

A pass that meets its own step already `running` knows the pass before it died
there, because the lease excludes any other. It retries the step as a counted
attempt with the same `invocationId`, so a function can dedupe on it, and a step
that kills its process every time runs out of attempts rather than crash-looping.
The alternative, failing the step, turns every deploy into failed runs.

Running out fails the step with `WorkflowStepLeaseExpiredError`. That includes a
step with `retries: 0`, which said it wanted no second attempt.

## Sleeps keep their deadline

Replay cannot recover a sleep: `scheduled` means something is coming, which is
right on every pass but the one after it was lost. So a sweep reads `scheduled`
steps directly. A sleep's wake time is when it was scheduled plus its duration.
At startup, a process that has armed nothing arms a timer for what remains, or
wakes the sleep if it is overdue. After that a sleep is left alone until it is 5s
overdue, because only then is its timer known to be lost.

Instances cannot tell whose timer a sleep has, so each one that starts arms its
own. That is safe, because a wake-up only sets the sleep's result to `null`, and
resuming is idempotent. The same goes for a durable scheduler, whose job still
fires alongside the re-armed one.

A dispatched step parked on `scheduled` is sent again once its job looks lost,
on the relay's terms: age is the only signal, and the claim keeps a duplicate
from running.

## A retry waiting out its delay is not stalled

A step sitting `pending` on a later attempt looks like a lost dispatch, but it may
be waiting out `retryDelay` on purpose. A sweep leaves it alone until the delay
has passed, so turning recovery on does not fire retries early.

Runs keep their trace throughout, because every hop reads it from the run record.
See [a workflow run owns its trace](a-workflow-run-owns-its-trace.md).
