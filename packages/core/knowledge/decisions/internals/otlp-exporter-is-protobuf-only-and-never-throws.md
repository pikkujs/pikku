---
type: decision
title: The OTLP exporter is protobuf-only and never throws
description: Telemetry export is best-effort, bounded in memory, loopback by default, and cannot fail or slow the app that produces it
tags: core
---

# The OTLP exporter is protobuf-only and never throws

`@pikku/core/otlp` encodes OTLP/HTTP by hand (`otlp/protobuf-writer.ts`,
`otlp-encode.ts`), so core takes no OpenTelemetry SDK and no dependency. There is
no JSON mode: one wire format, one set of bugs. The encoder is checked byte for
byte against an independent encoder, and `@pikku/core/testing` has a reader
(`decodeTraces`, `decodeLogs`, `decodeMetrics`) for tests.

- Export never throws into the caller. A failed batch is retried once after 1s
  (not on a 4xx other than 408 and 429), ten failed batches in a row back off
  for 30s, and a warning is logged at most once a minute per signal.
- The queues are capped (2048 spans, 4096 logs, 512 metrics). Overflow drops the
  oldest and is exported as the cumulative sum `pikku.telemetry.dropped{signal}`.
- GreptimeDB turns span attributes into typed columns, so a value whose type
  differs from the first one seen for that key is rejected with a 400. The
  exporter coerces to the first-seen type and drops a value it cannot coerce
  rather than invent data (`attribute-types.ts`).
- `createRuntimeTelemetry` refuses a non-loopback endpoint unless
  `PIKKU_OTLP_ALLOW_REMOTE=1`, and a malformed `PIKKU_OTLP_HEADERS` throws at
  start.
- Headers can differ per signal (`PIKKU_OTLP_TRACES_HEADERS`,
  `_LOGS_HEADERS`, `_METRICS_HEADERS`), because GreptimeDB wants its pipeline
  header on traces only.
- Nothing here uses `AsyncLocalStorage`: `contextStorage` is an optional injected
  interface, so the subpath stays edge-clean.
