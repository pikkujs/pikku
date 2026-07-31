---
type: decision
title: Queue jobs carry the producer's pikku user id
description: A job's pikkuUserId is trusted as identity by the worker, so enqueue rights are effectively act-as-user rights
tags: queue
---

# Queue jobs carry the producer's pikku user id

`JobOptions.pikkuUserId` (`packages/core/src/wirings/queue/queue.types.ts`) is
set by whoever enqueues the job. The adapter surfaces it as
`QueueJob.pikkuUserId`, `runQueueJob` in
`packages/core/src/wirings/queue/queue-runner.ts` copies it onto the wire as
`PikkuQueue.pikkuUserId`, and `resolveSession` in
`packages/core/src/function/function-runner.ts` then resolves it through
`defaultPikkuUserIdResolver` and loads that user's session out of the
`sessionStore`. The worker function runs with that session.

There is no re-authentication at the worker boundary — the queue payload *is* the
credential. Workers run with `auth: false`, so nothing downstream re-checks that
the producer was entitled to name that user. This is deliberate: the whole point
is to let a background job resolve the same per-user credentials the original
request had, without persisting a token in the queue. The cost is that write
access to the queue is equivalent to being able to act as any user whose session
is in the store.

**What this rules out:** exposing job enqueue to untrusted callers, or letting a
client-supplied field flow into `JobOptions.pikkuUserId` without an authorization
check first. It also rules out treating the queue as a trust boundary — do not
add a "the worker validated it" assumption anywhere downstream, and do not drop
the id from the wire on the theory that workers are unauthenticated anyway.
