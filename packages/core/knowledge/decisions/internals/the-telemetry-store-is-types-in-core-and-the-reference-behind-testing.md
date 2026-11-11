---
type: decision
title: The telemetry store is types in core, and the reference store sits behind a testing subpath
description: '@pikku/core/telemetry-store is types only; MemoryTelemetryStore and conformance() live in @pikku/core/telemetry-store/testing, a server-tier subpath, so no runtime import reaches them'
tags: core, telemetry, testing
---

# The telemetry store is types in core, and the reference store sits behind a testing subpath

`TelemetryStore` and its row types are a contract that Studio's screens and
several backends (an in-memory store, a GreptimeDB addon, the cloud's
OpenObserve store) share. The owner rejected a package of its own for it, so it
lives in `@pikku/core` as two subpaths:

- `@pikku/core/telemetry-store` — `export type` only. Importing it costs a
  bundle nothing.
- `@pikku/core/telemetry-store/testing` — `MemoryTelemetryStore` and
  `conformance(store, { ingest })`. The suite imports `node:test` and
  `node:assert`, so the subpath is declared `server` for `@pikku/core` in
  `cloudsupport.data.ts` and listed in `edge-clean.test.ts`, the way
  `./testing` is.

**What this rules out:** re-exporting either value from the types subpath or
from a barrel a production server imports. A runtime that imports the interface
must not load the test runner.

**Semantics a backend must match** are written on the interface and enforced by
the suite: scope (`project` and `stage`, both required) isolates every read;
`logs` is newest first; `tail` orders by timestamp then a store-defined tiebreak and
never loses or repeats a record that shares one (a record arriving late, before
the cursor, is not guaranteed); the write half is optional, and a read-only store is
seeded through `conformance`'s `ingest` callback.

Backends are addons, not part of core.
