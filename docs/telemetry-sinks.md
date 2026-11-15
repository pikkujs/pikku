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
