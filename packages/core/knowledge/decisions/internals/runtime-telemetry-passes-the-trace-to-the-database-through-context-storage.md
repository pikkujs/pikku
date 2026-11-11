---
type: decision
title: The runtime passes the trace to the database through its own context storage
description: Core cannot import node:async_hooks, so the runtime supplies the storage and a Kysely query span becomes a child of the function span
tags: core
---

# The runtime passes the trace to the database through its own context storage

`@pikku/core` must run on edge runtimes, so it never imports `node:async_hooks`.
`createRuntimeTelemetry` takes a `contextStorage` from the runtime instead, and
`asContextStorage(new AsyncLocalStorage())` adapts one. The tracer runs a function
inside `runInSpan`, and `RuntimeTelemetry.currentTrace()` reads the active trace
back out.

The Kysely trace dialect calls `currentTrace()` once per query and opens a child
span, so `db.select` lands under the function span in the same trace. Without a
`contextStorage`, `currentTrace()` returns `undefined` and queries are not traced
rather than parented wrongly. A test in `@pikku/kysely` drives a real
`OtlpTracer` and decodes the export to prove the parenting.

A disabled run (no `PIKKU_OTLP_ENDPOINT`, or `PIKKU_TELEMETRY=0`) gets the inert
telemetry and the plain dialect: no exporter, no timer, no connection.
