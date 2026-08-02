---
type: decision
title: Workflow step retries are owned by the workflow, never by the queue
description: A step's retry count is resolved once and always passed to the queue as `attempts`, so the queue can never apply its own default
tags: workflow
---

# Workflow step retries are owned by the workflow, never by the queue

A step's retry policy comes from the step itself, falling back to
`DEFAULT_STEP_RETRIES` (5) when unset. The default is deliberately greater than
zero so a transient failure — a DB blip, a downstream restart, a deploy — is
ridden out without the author asking for it; that is safe only because every
step gets a stable `invocationId` to dedupe on. An explicit `retries: 0` means
exactly once and must be honoured.

`resolveStepJobOptions` in `pikku-workflow-service.ts` therefore ALWAYS emits
`attempts`, even when it is 1. Backoff defaults to exponential whenever at least
one retry remains, so retries ride out an outage instead of firing instantly; a
concrete `retryDelay` (`15000`, `'15s'`) selects fixed backoff, and only the
literal `'exponential'` selects exponential explicitly. `rpcStep` resolves the
policy once, before both persistence and dispatch, so the value stored on the
step row — which drives `retriesExhausted` — is the same number the queue turns
into `attempts`. `queueGraphNode` in `graph/graph-runner.ts` defaults node
retries to `DEFAULT_STEP_RETRIES` for the same reason.

**What this rules out:** dropping `attempts` when it equals 1 "because that is
the default anyway", resolving retries separately at the persistence and
dispatch sites, or letting the queue adapter's own `retry_limit` decide. Any of
those lets the queue re-run a step the workflow said to run once, or lets the
engine believe retries are exhausted while the queue keeps retrying.
