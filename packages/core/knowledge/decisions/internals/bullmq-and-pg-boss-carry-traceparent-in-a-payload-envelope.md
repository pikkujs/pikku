---
type: decision
title: BullMQ and pg-boss carry traceparent in a payload envelope
description: Neither queue has a per-job metadata slot that survives; a traced job's payload is wrapped by the adapter and unwrapped before job.data is read
tags: core, queue, observability
---

# BullMQ and pg-boss carry traceparent in a payload envelope

Each adapter uses the native header where one exists: NATS headers, SQS message
attributes. Cloudflare and Azure use the body the adapter already wraps.

BullMQ and pg-boss have no such slot:

- BullMQ's `telemetry.metadata` is its own: `Queue.add` overwrites it when
  telemetry is configured and `moveToFailed` rewrites it on retry. Unknown job
  options are undocumented.
- pg-boss `SendOptions` has no metadata field.

So a traced job is stored as `{ __pikkuTraceparent, data }`, by
`wrapJobTrace`, and `mapBullJobToQueueJob` / `mapPgBossJobToQueueJob` undo it with
`unwrapJobTrace`.

The envelope sits below `SignedQueueService`, so what was signed is what the
worker verifies, and a function's `job.data` is unchanged. Anything reading the
tables or Redis directly sees the wrapper.

A job without a trace is stored raw, and `unwrapJobTrace` accepts only an object
with exactly the two envelope keys and a string trace, so a job enqueued before
this change parses as it did. A payload with that exact shape would be
misread, which is why the key is namespaced.
