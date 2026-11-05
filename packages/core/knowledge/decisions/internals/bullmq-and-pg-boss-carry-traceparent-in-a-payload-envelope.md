---
type: decision
title: BullMQ and pg-boss carry traceparent in a payload envelope
description: Neither queue has a per-job metadata slot that survives; a job with a trace or an identity claim has its payload wrapped by the adapter and unwrapped before job.data is read
tags: core, queue, observability
---

# BullMQ and pg-boss carry traceparent in a payload envelope

The same transport carries a job's signed identity claim. Each adapter uses the
native header where one exists: NATS headers, SQS message attributes. Cloudflare
and Azure use the body the adapter already wraps.

BullMQ and pg-boss have no such slot:

- BullMQ's `telemetry.metadata` is its own: `Queue.add` overwrites it when
  telemetry is configured and `moveToFailed` rewrites it on retry. Unknown job
  options are undocumented.
- pg-boss `SendOptions` has no metadata field.

So a job is stored as `{ __pikkuTraceparent?, __pikkuUserId?, data }`, by
`wrapJobTrace`, and `mapBullJobToQueueJob` / `mapPgBossJobToQueueJob` undo it with
`unwrapJobTrace`.

The envelope sits below `SignedQueueService`, so what was signed is what the
worker verifies, and a function's `job.data` is unchanged. Anything reading the
tables or Redis directly sees the wrapper.

A job with neither is stored raw. `unwrapJobTrace` accepts only an object whose
keys are all envelope keys, with at least one of the two markers and both
strings when present, so a job enqueued before the envelope, or before it
carried identity, parses as it did. A raw payload with that exact shape would be
misread, which is why the keys are namespaced. Misreading it grants nothing:
`pikkuUserId` here is an unverified claim, and
[`runQueueJob` verifies it against the unwrapped data](../security/queue-job-identities-are-signed-at-enqueue.md).
