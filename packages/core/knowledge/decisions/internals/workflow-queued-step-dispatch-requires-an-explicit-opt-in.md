---
type: decision
title: A workflow step goes through the queue only if its function opts in, and there is no inline fallback
description: `workflowQueued: true` is the whole decision; a missing queue service is a hard error, not a silent downgrade
tags: workflow
---

# A workflow step goes through the queue only if its function opts in, and there is no inline fallback

`dispatchStep` in `pikku-workflow-service.ts` decides queued-vs-inline purely
from the step function's `workflowQueued` flag in function meta, which defaults
to false. If the flag is not set the method returns false and the caller runs
the step inline. If it IS set and no queue service is configured, that is a hard
error naming the step and the function — never a quiet downgrade to inline
execution, because a function marked `workflowQueued` was marked that way for a
reason (isolation, a long tail latency, a resource limit) that inline execution
does not honour.

Inline execution is not merely a degraded queue path. `runInlineRetryLoop` wraps
the same `running → result` / `fail → retry-attempt → backoff → retry`
scaffolding around a step-specific body and stays O(K) — no suspend, no replay —
which is what makes an inline run cheap. Its optional `onError` hook exists for
terminal errors that must NOT retry (RPC-not-found suspends the run for
redeploy); if the hook throws, the loop exits immediately without recording a
step error or retrying.

**What this rules out:** inferring "should queue" from the presence of a queue
service, falling back to inline when the queue is missing, and reusing
`runInlineRetryLoop` for anything that needs to suspend between attempts.
