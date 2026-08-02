---
type: decision
title: Webhook delivery history records every attempt, best effort
description: The webhook worker persists each attempt before it throws, and a failure to persist is logged rather than allowed to mask the delivery result
tags: services
---

# Webhook delivery history records every attempt, best effort

`pikkuWebhookWorkerFunc` (`packages/core/src/services/queue-webhook-service.ts`)
POSTs the delivery, then — when the job carries a `deliveryId` — calls
`webhookService.recordAttempt` with the outcome *before* throwing on a non-2xx.
The throw is what makes the queue retry, so recording first is the only way the
console's delivery history shows every try rather than just the final one.

A `deliveryId` is only present when a store-backed implementation (e.g.
`KyselyWebhookService`) enqueued the job, which is why the queue-only default's
base `recordAttempt` — which throws `NotImplementedError` — is never reached.
The `recordAttempt` call is wrapped in `.catch(log)`: history is bookkeeping, and
a store outage must not turn a delivered webhook into a failed one, nor a failed
one into an unexplained crash.

**What this rules out:** awaiting `recordAttempt` without the catch, moving it
after the throw, or making the worker's success depend on the store being
reachable. Equally, do not delete the `.catch` as a swallowed error — the log
line is the intended handling.
