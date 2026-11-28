---
type: decision
title: A failure unwind waits for every forward step and fails the dead ones
description: Nothing is undone beside a step that is still being worked; a step counts as dead only on proof, and recovery drives a waiting unwind itself
tags: workflow, leases, reliability
---

# A failure unwind waits for every forward step and fails the dead ones

An unwind started by a failure waits for every forward step in flight, with a
compensation or without. A step still running can still have an effect, and a
child it started can still add work to undo. Ending the run beside it would report
a run as undone while it was still doing things. That includes the two ways a
child's outcome ends its parent's unwind (its compensation failed, or it rested at
a milestone): the parent records it and applies it once nothing is in flight. A
run with nothing to undo therefore passes through `compensating` too.

An unwind started by a cancel waits only for steps that have a compensation, and
for child workflows.

## Dead needs proof

Waiting is only safe if a step nobody is working ends. The driver, which holds the
run lease, settles what it can prove and leaves the rest:

| The step in flight                 | What the driver does                                   |
| ---------------------------------- | ------------------------------------------------------ |
| open in this process               | waits, `pending` ones too (a sleep, a retry delay)     |
| `pending` or `scheduled`           | claims it, then refuses it as on any stopped run       |
| an approval or suspend gate        | fails it as stopped with the run                       |
| parked on a child                  | records the child's outcome once it has one            |
| holding a step lease (queued)      | fails it once the lease has expired on the store clock |
| no lease and no child (pass-owned) | fails it only with proof the pass is gone              |

The claim comes before the refusal so that a worker taking the step at the same
moment either has it or never gets it.

Proof for a pass-owned step is a real run lease: the pass held it, and the driver
holds it now. A pass-through lease excludes nobody, so it proves nothing, except
for a store that says every attempt that can work its steps is in this process's
open-step registry (`openStepsAreAllSteps`). The in-memory service says so. A
subclass whose storage another process also works has to say it does not, as must
any store that cannot know. A child step whose child was never linked is left
waiting: nothing says whether a child exists.

A dead step is failed `WorkflowStepLeaseExpiredError` whatever retries it has
left, and is not run again, because that would start forward work in a run that is
being undone. If it has a compensation, it runs with `ok: false`: the step may
have had its effect before it was lost.

A step with a live lease, or open in the driver's process, is never declared dead,
including one that never ends. The run stays `compensating`, and the driver logs
which step it waits on, at most once a minute per step. Give a step a `timeout` to
bound it.

## Recovery drives it

A dead step sends nothing, so something has to look. `findRunsAwaitingDriver`
lists the runs in `DRIVEN_RUN_STATUSES`, and recovery drives each through
`RunUnwinds.redrive`: under the run lease, one driver per run, with or without a
queue. Sending an orchestrator job instead was rejected, because a host without a
queue would never look again. Compensations that run inline therefore run in the
sweeping process. Queued ones still need the queue.

Listing by status is deliberately broad. Whether a step is dead is decided under
the lease, not by the query, so a store only has to find the runs. Redis keeps an
index of them, written by the script that writes the run's status, so the two
cannot disagree. The first listing indexes the runs already stored.

## A retry takes its lease as it is created

A worker retrying a failed step creates an attempt that is already `running`. On a
store with step leases the lease must be part of that write. Between two writes
the attempt would read as pass-owned, and a driver holding the run lease would
declare it dead while its worker was about to run it.

**What this rules out:** failing a step on how long it has been running, rerunning
a dead forward step during an unwind, inferring death from a pass-through lease
across processes, and finishing a run while a forward step is in flight.
