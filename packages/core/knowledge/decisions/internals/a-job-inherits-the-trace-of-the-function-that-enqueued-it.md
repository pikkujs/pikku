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
- `schedulerService.scheduleRPC` called from a function. The workflow engine
  passes the run's trace for a sleep; nothing stamps other callers.

The runner's guard forbids `function` importing `wirings/queue` at runtime, which
is why the wrapper lives in `function/trace-queue-service.ts`.
