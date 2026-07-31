---
type: decision
title: Queue jobs always carry an explicit attempts count
description: resolveJobOptions always passes attempts so a queue backend can never apply its own retry default, and an explicit retries of 0 is honoured
tags: services
---

# Queue jobs always carry an explicit attempts count

`QueueWebhookService.resolveJobOptions`
(`packages/core/src/services/queue-webhook-service.ts`) resolves retries as
per-call `retries` → `config.webhook.retries` → `DEFAULT_WEBHOOK_RETRIES`, then
*always* puts `attempts: retries + 1` on the job options. It mirrors the workflow
service's policy resolution. Backoff is exponential unless a concrete
`retryDelay` selects a fixed one.

Two rules are load-bearing. `attempts` is passed unconditionally so the queue
backend never gets to apply its own default — pg-boss, BullMQ and SQS disagree
about what that default is, and a webhook silently retried a different number of
times per backend is not a behaviour anyone can reason about. And an explicitly
set `retries: 0` is honoured rather than treated as unset, because "deliver this
exactly once, do not retry" is a real caller intent that `??` chains lose.

**What this rules out:** omitting `attempts` when it equals the default, folding
`retries` into a truthiness check (`retries || configRetries`, which turns 0 back
into the default), and relying on a queue adapter's retry configuration in place
of passing the value.
