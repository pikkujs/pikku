---
type: decision
title: An inline workflow run reports its run id the moment it exists, because a failure throws instead of returning
description: `onRunCreated` is the only moment guaranteed to happen whether the run passes, fails or suspends
tags: workflow
---

# An inline workflow run reports its run id the moment it exists, because a failure throws instead of returning

`startWorkflow` in `pikku-workflow-service.ts` calls `options.onRunCreated(runId)`
immediately after `createRun`, before any execution. An inline run that fails
throws rather than returning `{ runId }`, so a caller wanting to read the run
back — its steps, which one failed, what it was called with — would otherwise
have nothing to read it by. Run creation is the only moment guaranteed to happen
whether the run goes on to pass, fail or suspend.

The failure path is equally deliberate. `WorkflowAsyncException`,
`WorkflowCancelledException`, `WorkflowSuspendedException` and
`WorkflowDispatchException` are all excluded from the "mark the run failed"
branch: the first three already recorded their own status, and the fourth is
transient. When a run does fail, an *expected* error (a `PikkuError`, e.g. a
build gate tripping) logs only its message — the message is the whole story, and
the `expected` flag survives the step-boundary rehydration that strips the
class. Anything else is logged in full so the trace is there to debug.

**What this rules out:** moving `onRunCreated` to after execution or into the
success path, returning a sentinel run id instead of throwing, folding the four
control-flow exceptions into the generic failure branch, or dumping a stack for
every expected error.
