# @pikku/queue-nats

## 0.12.2

### Patch Changes

- 4c7a1b5: Run the monorepo's own scripts through bun instead of yarn. What moves is the
  package manager each package's `prepublishOnly` and build scripts invoke, plus
  the two manifest fixes bun needs to resolve the tree: `uWebSockets.js` is
  declared with an explicit `github:` specifier, and `@pikku/uws-handler` marks
  its `uWebSockets.js` peer optional so a bun install of a consumer that brings
  its own uWS app does not try to fetch it from the registry.

  Three published behaviours change, all of them cases where an isolated
  `node_modules` or bun as the runtime had been papered over by yarn's hoisting:

  - `@pikku/migrator-sql` turns foreign keys on when it opens a sqlite database
    through bun. `node:sqlite` enforces them by default and `bun:sqlite` does not,
    which silently turned every `ON DELETE CASCADE` into a no-op under
    `bunx --bun pikku`.
  - `@pikku/cli` resolves a deploy provider against the project being deployed
    rather than against wherever the CLI itself is installed, which is what its
    own "is not installed" error asks the user to arrange.
  - `@pikku/cli` treats a specifier a runtime hands straight back — bun does this
    for the modules it implements itself — as not resolved from the project, so
    it falls back rather than loading the runtime's own copy.

- Updated dependencies [4c7a1b5]
  - @pikku/core@0.12.108

## 0.12.1

### Patch Changes

- 427c4fe: **`@pikku/queue-nats`** — NATS JetStream queue, worker and scheduler services, alongside the pg-boss and bullmq adapters. Jobs publish to a work-queue stream, each queue gets its own durable pull consumer, and `max_ack_pending` is real per-message concurrency rather than a batch size, so a slow job occupies one slot instead of holding its batch siblings. The per-job retry policy travels in headers because JetStream's `max_deliver` is per-consumer and cannot express a step marked "never retry", and `ack_wait` is always set to pg-boss's 900s parity rather than left to the server's 30s default — unset, any job running longer than 30s is redelivered while it is still running and executed twice. Cron and one-shot delays use the server's own message scheduler, so a schedule is a retained message on a reserved subject: publishing registers it, republishing replaces it, purging cancels it. That needs a server on 2.14+, and `NatsServiceFactory` refuses to start against anything older rather than silently not scheduling. `supportsResults` is `false`, deliberately — a work-queue stream deletes a message on ack, so there is nowhere for a job result or any job history to live, and per-job outcomes come from telemetry instead.
- Updated dependencies [1ab831e]
  - @pikku/core@0.12.105
