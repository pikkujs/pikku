---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
'@pikku/skills': patch
---

A workflow unwind no longer stays `compensating` for good on a step that lost its worker.

- An unwind started by a failure waits for every forward step in flight, with `compensate` or without, including before a child's outcome ends it.
- A step that lost its worker is failed `WorkflowStepLeaseExpiredError` without being run again, and is compensated with `ok: false` if it has `compensate`. A step that is still being worked is waited for, and a warning names it.
- Recovery on the Redis, MongoDB, Kysely and in-memory stores drives `compensating` runs itself, with or without a queue.
- An inline graph run holds its run lease for the whole run, so a second pass is refused and a lost lease is handled as in a DSL run.

A custom workflow store has a changed contract: see `docs/MIGRATION.md`.
