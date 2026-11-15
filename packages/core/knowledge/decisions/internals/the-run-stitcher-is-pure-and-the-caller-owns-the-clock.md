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

- **One clock domain.** `nowMs` is compared with span times (the health window
  cuts on a span's end time), so it must be unix ms on the clock the spans use:
  the wall clock live, the replayed span time on replay. Mixing them (span time
  to `start`/`end`, `Date.now()` to `sweep`) is a caller bug the stitcher cannot
  see. Samples may arrive in any order; the window keeps them sorted.
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
  ends-only input (every run rooted on a database span), and with start frames a
  sink registered mid-request sees a child first. So a span with no parent is the
  root, with or without start frames; a span with a parent waits, and the span
  whose parent never arrives becomes the root once `settleMs` has passed.
  Nothing is emitted for a trace until its root is known.
- **Database spans** (`db.system`, checked before span kind) are folded into the
  nearest hop's `DbSummary` and are never hops or health keys. The summary is
  frozen when the hop's end is emitted; a later database span is counted in
  `DbSummary.dropped` and announced by a `run.hop` event with phase `update`, so
  a snapshot plus later events still equals the stream.
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
  Views also carry the seq of their events (`startedSeq`, `closedSeq`,
  `startSeq`, `endSeq`), so a rebuild orders exactly instead of guessing within
  one millisecond. A snapshot rebuild is therefore equal to the live path, and a
  property test proves it with and without start frames, and past the span cap. Attributes are default-deny
  (the OTLP exporter's allow-list, so a custom attribute never reaches a browser)
  and bounded once (`boundAttrs`: `pikku.*` keys first, 64 entries, 256-char
  values, JSON-safe) and events and views
  share that copy, so views never hold more than events carried.
- **Start frames are the sink's job.** The stitcher does not guess: with ends
  only a trace arrives as one burst at its root's end. Feed `onSpanStart` to get
  per-hop start events live.
- **Output is JSON-safe**: ms numbers, no bigint, no undefined keys.
- **Bounds.** Open runs, spans per run, spans in total, retained closed runs,
  remembered closed trace ids, health keys and samples are capped. A span past
  `maxSpansPerRun` is ignored entirely (no event, view or health sample, so
  nothing is reported that a rebuild could not show, and a duplicate cannot
  double-count). Eviction is by recency, not creation. Once a run leaves
  retention its trace id lives in a separate bounded set (`maxClosedTraces`), so
  a late span is recognised and ignored, never a second run rooted on itself;
  only past that bound is a very old trace treated as new.
- **Boundary failures.** A failed boundary span (a failed publish) is not a hop
  and not a health key (counting only failures would read as a 100% error rate).
  Its error becomes the run's `failure` when no hop failed first, naming the hop
  it hangs off. A boundary root is covered by the run's own outcome.
- **Verifier.** The test that drives a real `OtlpTracer` through `fanOutOtlp`
  into the stitcher stands in for the verifier the design asked for. A suite
  under `verifiers/` that feeds a generated project's spans is not built: it
  needs a generated app running, and nothing in the stitcher depends on one.
- **Outcome `denied`** is a guess from the error class or an HTTP 401/403, as in
  the city's former assembler.
