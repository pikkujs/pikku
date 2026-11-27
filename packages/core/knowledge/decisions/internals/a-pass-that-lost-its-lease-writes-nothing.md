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
  one that writes has to check the pass's own signal. A step's lock does not: it
  covers a suspend or approval gate, whose own exception is how the run suspends,
  and replacing it would fail the run and compensate it.
- **The signal belongs to the pass.** Two passes of one run can be active in a
  process that outlived its first lease. Each hands its own signal to the steps it
  runs, and keeps its own step ordinals, so neither reads the other's loss or
  shifts the other's step names.
- **The signal trails the store.** A stalled process hears of a loss late, so step
  writes also carry the attempt. A refused one means the step moved on, which is
  never a failure of the run.
- **A success is still offered.** The work happened. The store's attempt check
  decides whether it is recorded.

## A failure recorded without its next attempt

Recording a failure and creating the next attempt are two writes, so a pass that
loses its lease or dies between them leaves a step `failed` with retries left.
The lost pass creates nothing. Whoever replays the step inline spends a retry:
an RPC step, a closure, or a compensation. A queued one is left to the queue,
which redelivers its job.

Letting the lost pass create the attempt, which the attempt fence would have
allowed, was rejected: it covers a lost lease and not a crash at the same point.
An inline graph node is not covered, since nothing replays one.

## When another pass may take a step back

A `running` step with no step lease reads the same whether its pass is working it
or gone. Holding the run's real lease settles that. A pass-through lease
excludes nobody, so `OpenSteps` records what this process is working: a closure
step that is open is left alone, and so is an inline RPC step between two
attempts. It says nothing about another process. A `running` inline RPC step is
still taken back while another pass in the process works it.

## The run is picked up again

A queued run is woken through the queue. Nothing else is bound to wake an inline
run, or an unwind a `cancelRun` caller is driving, so the process that lost the
lease takes it again and carries on, up to three times. If someone else has it,
or the pickups run out, it asks the queue for a wake and throws the loss. Only the
loss of the run's own lease does this: a parent that picked itself up over its
child's loss would start a second child.

A queued worker that lost its step lease finishes its job and sends a wake that
names the attempt. The store may read the lease as live for up to a lease after
the last renewal, and a pass that finds it so does nothing, so the wake is delayed
by a lease. One that still finds the attempt leased, as clocks that disagree or a
renewal that landed late can cause, sends another for when the lease runs out. If
a wake cannot be sent its job fails, so the queue redelivers it.

Waking on every pass that meets a leased step was rejected: each ordinary pass
beside a healthy step would start a chain of wakes of its own.

## What is left running

- **With no queue and no recovery,** a run whose lease cannot be taken again stays
  `running`. Nothing in the process is left to look at it, and a sweep resumes a
  run through the queue. `cancelRun` still stops it, subject to the last point.
- **An inline child** has no parent step to report to. When it is left running, so
  is the parent waiting on it.
- **An unwind waits for a step that is `running`** and has a compensation. If the
  run was cancelled, or started to unwind for another failure, while that step's
  pass or queued worker was losing its lease, the run stays `compensating`, even
  once a step lease has lapsed: nothing yet declares the step dead.

A pickup can run a function again beside a call that ignored its signal. That is
the same at-least-once guarantee a restart has, and `invocationId` is what a
function dedupes on.

**What this rules out:** recording any failure from a pass or worker that no
longer holds its lease, choosing a lease signal from the passes active on a run,
and marking a run failed because its lease could not be taken again.
