---
type: decision
title: An agentMiddleware onError hook cannot change how a run fails
description: Hook throws are swallowed so observability code can never convert, mask, or replace the original error
tags: agent
---

# An agentMiddleware onError hook cannot change how a run fails

Every `onError` invocation on the agent failure paths — in `streamAgent` and
`continueAfterToolResult` (`agent-stream.ts`) and in `runAgent` and
`continueAfterToolResultSync` (`agent-runner.ts`) — is wrapped in its own
`try/catch` that discards whatever the hook throws. The run is then marked
`failed` with the original error message, and the original error propagates.

`onError` is an observability hook: logging, metrics, alerting. A logger that is
itself broken must not turn a diagnosable agent failure into a confusing one, and
must not stop the remaining hooks from running or the run state from being
updated.

**What this rules out:** awaiting the hooks without a guard, and using `onError`
as an error-transformation hook whose throw replaces the original failure.
