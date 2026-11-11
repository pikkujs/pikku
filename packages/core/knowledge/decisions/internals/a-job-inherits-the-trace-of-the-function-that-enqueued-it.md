---
type: decision
title: A job inherits the trace of the function that enqueued it
description: The function runner wraps queueService per invocation so add() stamps the caller's traceparent; an explicit option wins, and a singleton producer is not stamped
tags: core, queue, observability
---

# A job inherits the trace of the function that enqueued it

Core has no AsyncLocalStorage: it runs on Workers and passes the wire explicitly.
So a function's `queueService.add(...)` cannot find its trace ambiently, and
asking every caller to pass `traceparent` would lose the trace at the first
call site that forgot.

`runPikkuFunc` therefore replaces `services.queueService` for the invocation with
`traceQueueService(queueService, wire)`. `add` sets
`options.traceparent ?? outgoingTraceparent(wire)` at add time and everything
else passes through. An explicit `traceparent` wins.

With a tracer, the publish is also a `producer` span, `queue.publish <queue>`,
child of the invocation's span; the job carries the producer span's
`traceparent`, so the consumer's span is the producer's child. The same holds for
`scheduleRPC` (`scheduler.schedule`) and a webhook `send` (`webhook.send`). The
span covers the `add` call until it settles. A caller-set `traceparent` still
wins on the job, and the span is then a record only. With no tracer or an
unsampled trace nothing is recorded and the wire's own trace is stamped.

A failed call records only `exception.type` on the span, never the message: a
queue or transport error can carry a connection URL with credentials, and the
span text is what a store keeps. The span closes when the promise the backend
returns settles; every queue and scheduler backend returns a real promise from
`add`, so there is no callback form to handle. A synchronous throw also ends the
span and is rethrown.

The wrapper sits around whatever the application registered. `SignedQueueService`
and `PikkuQueue` still see their own calls, and neither has to know about traces:
signing covers `data` and `pikkuUserId`, so the trace is not signed. A trace on a
job needs no signature because a bad one can only mislabel logs.
`runQueueJob` validates it with `continueTrace`, which starts a new trace for
anything `parseTraceparent` refuses.

`wire.queue` is not involved. It is the context of the job being processed, and
reusing it for the outgoing trace would give it two meanings.

## What it does not reach

Only the `queueService` on the services a function receives is stamped. These
enqueue without a trace, so the job starts a new one:

- singleton producers: webhook services, the agent scorer, and anything else
  that captured `queueService` at start-up
- a queue service captured in `createWireServices`, or held under another key

The runner's guard forbids `function` importing `wirings/queue` at runtime, which
is why the wrapper lives in `function/trace-queue-service.ts`.
