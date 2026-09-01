---
'@pikku/core': patch
'@pikku/kysely': patch
---

Give a running workflow step a lease, so a step whose worker dies can be claimed again

A step moving from `pending` to `running` only proves it was dispatched; it says
nothing about whether the worker holding it is still alive. A worker that died
mid-step therefore left the step wedged in `running` forever: unclaimable by the
next dispatch, and invisible to the stalled-run sweep.

The dispatch that claims a step now stamps a lease on it, refreshes that lease on
an interval for as long as it is working, and releases it when the step parks on
a child run. A step whose lease has lapsed is claimable again, and counts as
in-flight no longer, so the stalled sweep can pick its run back up. A step that
keeps losing its worker fails with `WorkflowStepLeaseExpiredError` once its
attempts run out, rather than looping.

The lease duration is taken from the queue the step is dispatched through, so the
lease and the queue lock never disagree about who owns the job.
