---
type: decision
title: The run stitcher is pure and the caller owns the clock
description: '@pikku/core/otlp/runs takes nowMs on every call, stamps every event with seq and at, folds db spans into a hop summary, and roots a run on a parentless span'
tags: core, observability
---

# The run stitcher is pure and the caller owns the clock

`createRunStitcher` (`packages/core/src/otlp/runs/`) turns the frames of an OTLP
sink (`OpenSpan`, `FinishedSpan`) into runs. It imports only core's own OTLP
types.

- **No clock.** `start`, `end`, `sweep` and `snapshot` each take `nowMs`; the
  package has no `Date.now`, timer or `Math.random`, and a test greps the source
  for them. The same frames and the same `nowMs` give byte-identical events. A
  history replay and the live sink therefore use one code path.
- **`seq` and `at`.** `seq` rises by one per emitted event. A snapshot carries
  the `seq` it reflects, so a client applies the buffered events with a greater
  one and a dropped event is repaired by fetching the snapshot again. `at` is the
  span's time in ms, so a browser renders by event time. The exception is
  `health`, stamped with the `nowMs` of the sweep.
- **Roots.** Real traces end children first, so first-span-is-root is wrong for
  ends-only input (every run rooted on a database span). With start frames the
  first span of a trace is the root; with ends only the root is the span with no
  parent, or, for a foreign parent, the span whose parent never arrives once
  `settleMs` has passed. Nothing is emitted for a trace until its root is known.
- **Database spans** (`db.system`, checked before span kind) are folded into the
  nearest hop's `DbSummary` and are never hops or health keys. The summary is
  frozen when the hop's end is emitted; a later database span is dropped.
  `repeated` exists only when `db.query.text` was present.
- **`rpcCaller` stays an ordinary hop.** In the real dumps the parentless span
  is the `rpcCaller` http span and it carries the user and the status, so
  treating it as a boundary was not needed to root a run correctly. `classify`
  can still return `boundary` for any span. The default does so for `producer`
  spans (queue publish, schedule, webhook send): they have no function, the
  consumer is the hop, and the city's former assembler did not draw them.
- **Views carry what events carry.** `RunView` has `attributes` (the root's, as
  `run.started`), `endedAt` and `outcome`; `HopView` has `attributes` (latest
  event's), `kind`, `functionId`, `db` and `hadStart` (a start event was sent).
  A snapshot rebuild is therefore equal to the live path, and a property test
  proves it with and without start frames. Attributes are bounded once
  (`boundAttrs`: 64 entries, 256-char values, JSON-safe) and events and views
  share that copy, so views never hold more than events carried.
- **Start frames are the sink's job.** The stitcher does not guess: with ends
  only a trace arrives as one burst at its root's end. Feed `onSpanStart` to get
  per-hop start events live.
- **Output is JSON-safe**: ms numbers, no bigint, no undefined keys.
- **Bounds.** Open runs, spans per run, retained closed runs, health keys and
  samples are capped. A span past `maxSpansPerRun` is still reported but is not
  remembered; a trace waiting for its root cannot report spans past the cap.
- **Outcome `denied`** is a guess from the error class or an HTTP 401/403, as in
  the city's former assembler.
