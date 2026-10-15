---
type: decision
title: The workflow status stream re-checks run ownership on every poll and closes when access is lost
description: streamWorkflowRunStatus asserts the run owner on each poll rather than once when the stream opens, and closes the channel when that check throws
tags: core, workflow, security, streaming
---

# The workflow status stream re-checks run ownership on every poll and closes when access is lost

`streamWorkflowRunStatus` defines `poll`, which reads the run and calls `assertWorkflowRunOwner(run.wire, session)` on every read (`packages/core/src/wirings/workflow/workflow-status-stream.ts:63-72`). The comment says ownership is read from the run itself, so a stream that outlives its session should stop rather than keep reporting (`:69-71`).

The polling loop runs inside a `try` (`:142`). A throw from any poll, including the ownership refusal, runs `channel.close()` and rethrows (`:159-161`). The comment at `:139-141` names this case.

`assertWorkflowRunOwner` is in `packages/core/src/wirings/workflow/workflow-run-ownership.ts:26-36`. It returns when the run has no recorded owner, and throws `WorkflowRunForbiddenError` when the session's `userId` does not match the owner (`:26-35`).

**What this rules out:** checking ownership only when the stream opens, and leaving a stream open after its ownership check throws.
