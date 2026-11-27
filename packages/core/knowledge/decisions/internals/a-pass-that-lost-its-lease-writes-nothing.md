---
type: decision
title: A pass that lost its lease writes nothing
description: Once a pass or a step worker has lost its lease, what it throws records nothing, the step stays running for the next owner, and the run is picked up again
tags: workflows, leases, reliability
---

# A pass that lost its lease writes nothing

A lost lease says the work may already belong to someone else. It says nothing
about the step. The error that follows is usually the abort itself, so recording
it would spend retries on attempts that start already aborted, fail the run, and
run compensation for a step that never failed.

So after the loss there is no step failure, no retry, no run status, no
compensation and nothing told to a parent. The step stays `running`, and whoever
owns the run next retries it as a counted attempt, or fails it with
`WorkflowStepLeaseExpiredError` when none are left. That holds for function,
closure, graph and compensation steps, and for a queued worker and its step
lease.

- **The run lease turns every throw into the loss.** Whatever the body threw,
  `withRunLease` raises `LeaseLostError`. A `catch` below it still runs first, so
  one that writes has to check the pass's own signal.
- **The signal belongs to the pass.** Two passes of one run can be active in a
  process that outlived its first lease. Each hands its own signal to the steps it
  runs, and keeps its own step ordinals, so neither reads the other's loss or
  shifts the other's step names.
- **The signal trails the store.** A stalled process hears of a loss late, so step
  writes also carry the attempt. A refused one means the step moved on, which is
  never a failure of the run.
- **A success is still offered.** The work happened. The store's attempt check
  decides whether it is recorded.

## The run is picked up again

A queued run is woken through the queue. Nothing else is bound to wake an inline
run, or an unwind a `cancelRun` caller is driving, so the process that lost the
lease takes it again and carries on, up to three times. If someone else has it,
or the pickups run out, it asks the queue for a wake and throws the loss. Only the
loss of the run's own lease does this: a parent that picked itself up over its
child's loss would start a second child.

A queued worker that lost its step lease sends the same wake and finishes its job.
If the wake cannot be sent the job fails, so the queue redelivers it.

## What is left running

- **With no queue and no recovery,** a run whose lease cannot be taken again stays
  `running`. Nothing in the process is left to look at it, and a sweep resumes a
  run through the queue. `cancelRun` still stops it, subject to the last point.
- **An inline child** has no parent step to report to. When it is left running, so
  is the parent waiting on it.
- **An unwind waits for a step that is `running`** with no lease and a
  compensation. If the run was cancelled, or started to unwind for another
  failure, while such a step's pass was losing the lease, the run stays
  `compensating`: nothing yet declares that step dead.

A pickup can run a function again beside a call that ignored its signal. That is
the same at-least-once guarantee a restart has, and `invocationId` is what a
function dedupes on.

**What this rules out:** recording any failure from a pass or worker that no
longer holds its lease, choosing a lease signal from the passes active on a run,
and marking a run failed because its lease could not be taken again.
