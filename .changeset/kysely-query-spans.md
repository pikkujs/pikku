---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/kysely-sqlite': patch
'@pikku/kysely-bun-sqlite': patch
'@pikku/kysely-node-sqlite': patch
'@pikku/kysely-postgres': patch
---

Kysely query spans. `@pikku/kysely` exports `traceDriver` / `traceDialect`, which wrap a driver so each statement is a `db.<operation>` client span, a child of the trace `currentTrace()` returns. A span carries `db.system`, `db.operation.name` and the first table (`db.collection.name`); `db.query.text` only with `recordSqlText` (placeholders, string literals masked, 1024 characters at most). Parameters are never read and a database error's message is dropped, only its class is recorded. With no current trace, no span is recorded. The sqlite, bun-sqlite, node-sqlite factories and `PikkuKysely` take `tracer`, `currentTrace` and `recordSqlText`.

`@pikku/core`: `Tracer` gains an optional `runInSpan(span, fn)`; the function runner calls it around the middleware chain and the function when present, so a tracer that keeps the current span in an `AsyncLocalStorage` can answer `currentTrace`. A tracer whose `runInSpan` throws is disabled and the function still runs once.

`collectTableNames` moved to `table-names.ts`, is exported, and no longer walks into parameter values.
