---
'@pikku/core': patch
---

`TelemetryStore` gains `functionMetrics`, `wireTypes` and `wireRuns` (required members), an optional `tenant` filter on logs, trace, `metricsSummary`, `functionMetrics` and `wireTypes`, a `functionId` filter on `metricsSummary`, optional `firstSeen` and http fields on `FailureRow`, and a read-side `durationMs` on `LogRecord` taken from the root span of its trace. `trace` takes an optional second argument. `MemoryTelemetryStore` and `conformance()` cover all of it. An implementation of `TelemetryStore` outside this repository must add the three methods; see MIGRATION.md.
