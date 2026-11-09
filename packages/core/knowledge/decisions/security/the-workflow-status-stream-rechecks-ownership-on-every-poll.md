---
type: decision
title: The workflow status stream re-checks run ownership on every poll and closes when access is lost
description: streamWorkflowRunStatus asserts the run owner on each poll rather than once when the stream opens, and closes the channel when that check throws
tags: core, workflow, security, streaming
---

# The workflow status stream re-checks run ownership on every poll and closes when access is lost

`streamWorkflowRunStatus` defines `poll`, which reads the run and calls `checkWorkflowRunAccess(workflowName, run, wire, 'read')` on every read (`packages/core/src/wirings/workflow/workflow-status-stream.ts`). The check runs against the `wire` captured when the stream opened, so it re-reads the run's owner and the workflow's `auth` each poll but does not re-validate the session itself: an expired or revoked session keeps reading until the run or its owner changes (`:69-71`).

The polling loop runs inside a `try` (`:142`). A throw from any poll, including the ownership refusal, runs `channel.close()` and rethrows (`:159-161`). The comment at `:139-141` names this case.

`checkWorkflowRunAccess` is in `packages/core/src/wirings/workflow/workflow-run-access.ts`. It throws when the run is missing or belongs to another workflow (404), when it belongs to another user (403), and when a caller with no session reads a run of a workflow that wants one (401).

**What this rules out:** checking ownership only when the stream opens, and leaving a stream open after its ownership check throws.
