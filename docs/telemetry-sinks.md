# Telemetry sinks: `otlpSinks` and `analyticsSinks`

Core creates two registries before your `createSingletonServices` runs in `pikku dev`, `pikku serve` and a standalone build, and passes them in as `existingServices.otlpSinks` and `existingServices.analyticsSinks`. Cloudflare deploys have no runtime telemetry path today, so the registries are not created there.

```typescript
existingServices.otlpSinks.add(spanLog)
existingServices.analyticsSinks.add(conversions, { checkout_completed: true })
```

## OTLP sinks

An `OtlpSinkBase` has `exportSpans`, `exportLogs`, `exportMetrics`, `flush`, `close`, and optionally `setResource` (what this process is, delivered on registration) and `onSpanStart` (a sampled span has started). The HTTP exporter is one sink, registered only when `PIKKU_OTLP_ENDPOINT` is set.

- The tracer is always real. With no sink registered it records nothing but the trace ids still flow.
- The list is read at export time, so a sink added later receives what happens from then on.
- A sink that throws never fails a request and never costs another sink its data. Each sink keeps its own queue.
- `flush` and `close` share one 2 second cap.
- An unsampled trace never reaches a sink.
- A sink registered in process is your own code, so the loopback rule applies only to the HTTP exporter endpoint.

## Typing a map

`OtlpSink<TMap = void>` adds `setMap(map: TMap)`. `add<TMap>(sink, map)` infers `TMap` from the sink, never from the map argument, and calls `sink.setMap(map)`. A mapped sink with no map, a wrong map, or a map given to a sink that has none is a type error. The registry erases the map type after `add`.

## Analytics sinks

`AnalyticsEventSink` is an `AnalyticsService` with an optional `setMap`. The map is required and its keys are the event names the sink receives. An event not in the map does not go to that sink. With no sink registered, events go to the logger as before. In local dev the Kysely sink is registered for every declared event.

## Stitching spans into runs: `@pikku/core/otlp/runs`

`createRunStitcher()` turns the frames an OTLP sink receives into runs: one run per trace, with hops, an outcome and a stamped event for every change. It is a pure state machine. It has no timers and never reads a clock: every call takes `nowMs`, and the caller sweeps on its own interval. `nowMs` is compared with span times (the health window uses a span's end time), so it must be unix milliseconds on the same clock as the spans: the wall clock live, the replayed span time when replaying.

```typescript
const stitcher = createRunStitcher({ resource: { serviceName: 'online-shop' } })
const now = () => Date.now() // one clock, unix ms, for every call
otlpSinks.add({
  onSpanStart: (span) => stitcher.start(span, now()),
  exportSpans: (spans) => spans.forEach((span) => stitcher.end(span, now())),
  // exportLogs, exportMetrics, flush, close: no-ops
})
setInterval(() => stitcher.sweep(now()), 1_000)
```

- **Events.** `run.started`, `run.hop` (a `start` and an `end` phase, and an `update` phase when a late database span changes the hop's `db`), `run.finished`, `run.failed`, `run.expired` and `health`. Every event has `seq` (rises by one) and `at` (the span's time in ms, not wall time). Events are plain JSON: no bigint.
- **Snapshot.** `snapshot(nowMs)` returns the open runs, up to 50 recent closed runs, the health window and the `seq` it reflects. A client subscribes first, fetches the snapshot, then applies events with a greater `seq`. Reconnect means fetching it again.
- **Views carry what events carry.** A `RunView` has the root span's `attributes` (entry wire, user id, as `run.started` carries them), `endedAt` (the `at` of its closing event, absent while open), `outcome` and `durationMs`. A `HopView` has the `attributes` of its latest event (the end frame's once it ended, else the start frame's), `kind`, `functionId`, `db` and `hadStart`. Views also carry the `seq` of their events (`RunView.startedSeq` and `closedSeq`, `HopView.startSeq` and `endSeq`), so a client that rebuilds from a snapshot can replay in exactly the stream's order. `hadStart` is true only when a start frame arrived and a `run.hop` start event was sent; a client that rebuilds from a snapshot replays a start phase only for those hops. A client that applies a snapshot and the later events ends in the same state as one that saw every event.
- **Attribute bounds.** Events and views carry the same bounded copy of a span's attributes. Default-deny: only the keys the OTLP exporter lets out (its allow-list, plus the `db.` prefix) are kept, so a custom attribute never reaches a browser. At most 64 entries, `pikku.*` keys first (the cap cannot drop `pikku.wire.type` or `pikku.user.id`), string values cut to 256 characters, keys over 128 characters and non-finite numbers dropped.
- **Roots.** A span with no parent is the root, with start frames or ends only. A span with a parent (a foreign parent, or a sink registered mid-request so the first span seen is a child) waits: the root's own frame makes the root, else the earliest span whose parent never shows up becomes the root after `settleMs` (default 5 s). Nothing is emitted for the trace until then.
- **Database spans.** A span with `db.system` is folded into the nearest hop as a `DbSummary` (`count`, `totalMs`, `byOp` keyed `select booking`) and is never a hop. `repeated` appears only when spans carry `db.query.text`. A database span that ends after its hop's end was reported is counted in `dropped` (not in `count`) and announced by a `run.hop` `update` event.
- **Outcome.** `ok`, `error` or `denied`. `denied` is guessed from the error class (`ForbiddenError`, `UnauthorizedError`, ...) or an HTTP 401/403. A failing root ends `run.failed` and names the first failed hop.
- **Limits.** `maxOpenRuns` 1000, `maxSpansPerRun` 1000, `maxRetained` 50, `settleMs` 5000, `ttlMs` 120000, `healthWindowMs` 60000. `maxClosedTraces` 10000, `maxTotalSpans` 50000. A run with no activity for `ttlMs` ends `run.expired`. Eviction is by recency: the least recently seen open run expires when `maxOpenRuns` is hit, and the least recently seen closed run leaves retention past `maxRetained`; over `maxTotalSpans`, traces still waiting for a root go first. A span past `maxSpansPerRun` is ignored entirely (no event, view or health sample; its duplicates too).
- **Late spans.** A span that ends after its run closed links to its parent and is reported as a hop while the run is retained; it never opens a second run. Once a run leaves retention its trace id is kept in a bounded set (`maxClosedTraces`) and a late span of it is ignored; only past that bound is a very old trace treated as new.
- **Roles.** `classify(span)` returns `hop`, `boundary` (not shown, children hang off the nearest hop) or `db`. The default is `db` for `db.system`, `boundary` for a `producer` span (a queue publish, a schedule, a webhook send has no function of its own; the consumer that picks the job up is the hop, and it hangs off the nearest hop), otherwise `hop`.
- **Health.** Per function id: runs, errors, denied, average ms over the window, at most 1000 samples a function and 2000 keys. Samples may arrive in any order. Database spans and boundary spans are not keys; a failed boundary span (a failed publish) is instead the run's `failure` (naming the hop that was publishing) when no hop failed first.
- **Feed start frames.** Wire `onSpanStart` as well as `exportSpans`, as the example above does. With ends only, nothing is emitted for a trace until its root ends, so a run arrives as one burst; with start frames each hop emits its `start` phase the moment it opens, so a live view animates as the request runs. A sink that only has `exportSpans` still works, at the cost of that burst and of `hadStart: false` on every hop.
