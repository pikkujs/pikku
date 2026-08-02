---
type: decision
title: A step's compensation handler runs as a durable step of its own, and never compensates itself
description: A refund or rollback must not fire twice on replay, so `onError` is recorded as `<step>:onError` with retries disabled
tags: workflow
---

# A step's compensation handler runs as a durable step of its own, and never compensates itself

`runStepCompensation` in `pikku-workflow-service.ts` invokes a failed step's
`onError` RPC through `rpcStep` under the name `<stepName>:onError` rather than
calling it directly. Durability is the point: a compensation handler is
typically a refund or a rollback, and a bare invoke would fire again on every
replay that walks past the failed step. Recorded as a step, the second replay
finds it `succeeded` and returns the cached result.

It runs with `{ retries: 0 }` and its own `onError` is deliberately not
forwarded — a compensation handler cannot itself compensate. `onError` mirrors a
graph node's: the handler receives `{ error: { message } }`, and the original
error is still thrown afterwards, so the workflow fails either way. This is
compensation, not recovery.

**What this rules out:** invoking the `onError` RPC inline "since it's just
cleanup", giving it the workflow's default retry count, chaining a second
`onError` onto it, or swallowing the original error because the handler
succeeded.
