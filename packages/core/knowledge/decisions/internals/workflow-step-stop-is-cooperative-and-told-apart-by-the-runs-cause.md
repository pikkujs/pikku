---
type: decision
title: A running workflow step is stopped only by a cancel, its deadline or a lost lease
description: The stop is a per-attempt signal; a cancel is recognised by the run's recorded cause, because a run also compensates when another step fails
tags: workflow
---

# A running workflow step is stopped only by a cancel, its deadline or a lost lease

Each attempt gets its own `AbortSignal` (`workflow-step-signal.ts`). A
`compensating` run is not enough to abort a forward step: a run also compensates
when another step fails. `isRunCancelled` therefore reads the cause the unwind
recorded (`WORKFLOW_CANCELLED`). A step that has not started is different: it is
refused by any cancelled or unwinding run (`isRunClosedToSteps`).

- The in-process abort hangs off `updateRunStatus`, not `cancelRun`, because
  child runs are cancelled through the former. Another process is seen by a
  timer that reads the run with `getRun`; `getRunStatus` has no cause code.
- A step's failure path reads the run instead of `signal.aborted`, which may not
  have been told yet. A cancelled run records the failure and does not rethrow,
  or the queue would deliver the job again.
- A refused step needs a final outcome, or the unwind waits on it forever. A
  first attempt is also marked `noCompensate`, because it never ran.
- A cancel keeps the step lease renewed until the function settles. A deadline
  stops renewing and does not wait, because the function may never settle.
- `timeout` is stored on the step because a recovery pass rebuilds a lost job
  without the workflow body's options.

**What this rules out:** aborting forward steps from the run status alone, and
anything that aborts, refuses or skips a compensation step because of a cancel.
