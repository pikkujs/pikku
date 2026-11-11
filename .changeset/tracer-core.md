---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Adds a `Tracer` service and one span per function invocation; removes the `telemetryOuter` and `telemetryInner` middleware.

`singletonServices.tracer` (optional, `Tracer` from `@pikku/core/trace`) receives a span for every invocation, opened by the function runner from the ids already on `wire.trace` and ended in the runner's `finally` with the outcome. Attributes are a fixed allow-list of framework facts; errors are redacted to class and message with no stack; a tracer that throws is disabled for the process and never changes the function's result or error. With no tracer nothing is recorded (`NOOP_TRACER`). `@pikku/core/testing` gains `RecordingTracer`.

`telemetryOuter` and `telemetryInner` (and the `__pikku_telemetry` log lines they wrote) are removed from `@pikku/core/middleware`; see `docs/MIGRATION.md`.
