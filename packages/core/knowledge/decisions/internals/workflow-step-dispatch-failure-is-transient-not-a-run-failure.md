---
type: decision
title: A failed workflow step dispatch is transient infrastructure, not a run failure
description: Queue-unreachable errors leave the run running and the step pending so the orchestrator replays; marking the run failed loses it
tags: workflow
---

# A failed workflow step dispatch is transient infrastructure, not a run failure

`WorkflowDispatchException` (`pikku-workflow-service.ts`) means the queue itself
could not accept the job — pg-boss momentarily down, the transport unreachable —
not that the step's own logic failed. Everywhere it surfaces (`dispatchStep`,
`sleepStep`, `startWorkflow`, `orchestrateWorkflow`) the run is left untouched:
the step stays `pending`, the run stays `running`, and the orchestrator job is
rethrown so the queue redelivers it and the workflow replays from its snapshot.

The ordering inside `rpcStep` and `sleepStep` is load-bearing: dispatch happens
BEFORE the step is marked `scheduled`. If the step were marked `scheduled`
first and the dispatch then failed, the next replay would see `scheduled`,
pause, and wait forever for a job that was never enqueued.

Redelivery is always safe because an orchestrator job is idempotent: it replays
the workflow from the snapshot and every already-completed step returns its
cached result rather than running again. The per-job `attempts` that
`resolveStepJobOptions` always emits is what makes redelivery happen at all — it
overrides a queue configured with `retry_limit 0`, so the workflow's retry
policy survives a conservative queue configuration.

**What this rules out:** folding `WorkflowDispatchException` into the generic
catch that calls `updateRunStatus(runId, 'failed', ...)`, swallowing it so the
run silently stalls, or reordering `setStepScheduled` above `dispatchStep` /
`scheduleSleep` to "keep the status writes together". Each strands or kills a
run that a redelivered orchestrator tick would have recovered on its own.
