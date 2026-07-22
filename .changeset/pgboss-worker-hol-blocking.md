---
'@pikku/queue-pg-boss': patch
---

Stop one slow job from holding an entire queue (head-of-line blocking).

The worker mapped pikku's parallelism to pg-boss `batchSize`, whose handler
receives the whole fetched batch and only fetches again once that handler
resolves. Because the handler `Promise.all`s the batch, a single long-running
job blocked every sibling in its batch *and* stalled the next fetch — so on a
shared queue one slow job could freeze the worker and starve everything behind
it (observed with workflow-orchestrator jobs, where a long step pinned all 10
slots for tens of minutes).

Parallelism now maps to pg-boss `localConcurrency` with `batchSize: 1`: N
independent workers each fetch and process a single job and refill the instant
they finish, so a slow job never holds up the others. Same effective
concurrency, no head-of-line blocking.
