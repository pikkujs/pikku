---
type: decision
title: Query spans record operation and table, SQL text is opt-in, parameters are never read
description: A db span is a driver-wrapper span carrying the operation and first table; statement text is off by default and masked, parameters are never read, and a database error leaves only its class
tags: [tracing, kysely, spans, redaction]
---

# Query spans record operation and table, SQL text is opt-in, parameters are never read

`traceDriver` wraps `Driver.acquireConnection` and times `executeQuery`, because
a Kysely plugin sees the node going in and the rows coming out but not the
statement's start and end. A span is `db.<select|insert|update|delete|other>`,
kind `client`, with `db.system`, `db.operation.name` and `db.collection.name`
(the first table the node names, from `collectTableNames`).

- **SQL text** (`db.query.text`) is recorded only with `recordSqlText`. The
  compiled text holds `?` / `$1` placeholders, but `sql.lit` and `sql.raw` can
  put a literal in it, so single-quoted strings and dollar-quoted bodies are
  masked to `?` and the result is cut at 1024 characters.
- **Parameters** (`compiledQuery.parameters`) are never read, and
  `collectTableNames` does not walk into `ValueNode`s, so a value cannot be
  touched, or spoof a table.
- **Errors**: the message of a database error can echo a value, so the span gets
  the error class only (`exception.type`). The status message is `"<Class>: "`
  because the tracer builds it from the error it is handed; we hand it one with
  an empty message.
- **No parent, no span.** The parent comes from `currentTrace()`, read per query
  (one Kysely serves many invocations). If it returns nothing, or an unsampled
  trace, nothing is recorded; a span is never given a guessed parent.
- Transaction control and streamed queries are not spanned: begin/commit/rollback
  go to the real connection, and a stream's duration is the consumer's.

The current trace comes from `Tracer.runInSpan`: the function runner runs the
function inside it, and a tracer backed by `AsyncLocalStorage` answers
`currentTrace` from the same storage, so the db span's parent is the function span.
