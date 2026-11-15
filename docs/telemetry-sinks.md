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

`createRunStitcher()` turns the frames an OTLP sink receives into runs: one run per trace, with hops, an outcome and a stamped event for every change. It is a pure state machine. It has no timers and never reads a clock: every call takes `nowMs`, and the caller sweeps on its own interval.

```typescript
const stitcher = createRunStitcher({ resource: { serviceName: 'online-shop' } })
otlpSinks.add({
  onSpanStart: (span) => stitcher.start(span, nowMs),
  exportSpans: (spans) => spans.forEach((span) => stitcher.end(span, nowMs)),
  // exportLogs, exportMetrics, flush, close: no-ops
})
setInterval(() => stitcher.sweep(Date.now()), 1_000)
```

- **Events.** `run.started`, `run.hop` (a `start` and an `end` phase), `run.finished`, `run.failed`, `run.expired` and `health`. Every event has `seq` (rises by one) and `at` (the span's time in ms, not wall time). Events are plain JSON: no bigint.
- **Snapshot.** `snapshot(nowMs)` returns the open runs, up to 50 recent closed runs, the health window and the `seq` it reflects. A client subscribes first, fetches the snapshot, then applies events with a greater `seq`. Reconnect means fetching it again.
- **Roots.** With start frames the first span of a trace is the root. With ends only, a span with no parent is the root, and a span whose parent never shows up becomes the root after `settleMs` (default 5 s).
- **Database spans.** A span with `db.system` is folded into the nearest hop as a `DbSummary` (`count`, `totalMs`, `byOp` keyed `select booking`) and is never a hop. `repeated` appears only when spans carry `db.query.text`.
- **Outcome.** `ok`, `error` or `denied`. `denied` is guessed from the error class (`ForbiddenError`, `UnauthorizedError`, ...) or an HTTP 401/403. A failing root ends `run.failed` and names the first failed hop.
- **Limits.** `maxOpenRuns` 1000, `maxSpansPerRun` 1000, `maxRetained` 50, `settleMs` 5000, `ttlMs` 120000, `healthWindowMs` 60000. A run with no activity for `ttlMs` ends `run.expired`; the oldest open run is expired when the cap is hit.
- **Late spans.** A span that ends after its run closed links to its parent and is reported as a hop while the run is retained; it never opens a second run.
- **Roles.** `classify(span)` returns `hop`, `boundary` (not shown, children hang off the nearest hop) or `db`. The default is `db` for `db.system`, otherwise `hop`.
- **Health.** Per function id: runs, errors, denied, average ms over the window, at most 1000 samples a function. Database spans are not keys.
