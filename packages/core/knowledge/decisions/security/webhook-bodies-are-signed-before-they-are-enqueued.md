---
type: decision
title: Webhook bodies are signed before they are enqueued
description: QueueWebhookService computes the HMAC at enqueue time so the signing key never travels in the queue payload
tags: services
---

# Webhook bodies are signed before they are enqueued

`QueueWebhookService.prepareDelivery`
(`packages/core/src/services/queue-webhook-service.ts`) serialises the payload,
resolves the signing secret, computes the signature and writes it into the job's
`headers` — all before `queueService.add` is called. The worker,
`pikkuWebhookWorkerFunc`, POSTs headers it was handed and never sees a secret.

Signing in the worker instead would mean the key has to reach the worker, and the
only channel between the two is the queue payload: an SQS body, a Redis value, a
`jsonb` column, all of which are at rest, replicated, and visible to anyone who
can read the queue. The signature is not sensitive; the key is.

**What this rules out:** moving signing into the worker so it can re-sign on
retry, and putting `secret` (or a resolved key of any kind) onto `WebhookJobData`.
Note the related consequence: because the signature is fixed at enqueue time, a
key rotated between enqueue and delivery does not change an in-flight job's
signature — that is intended, not a bug to fix by carrying the key.
