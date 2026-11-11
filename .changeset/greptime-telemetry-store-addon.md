---
'@pikku/addon-greptime': patch
---

Add `@pikku/addon-greptime`, an addon that provides the `telemetryStore` service from GreptimeDB through a contributor.

The store writes logs, spans and metrics as OTLP/HTTP and reads them with SQL, and passes core's `TelemetryStore` conformance suite against a real GreptimeDB v1.3.0. An app opts in with `wireAddon({ name: 'greptime', package: '@pikku/addon-greptime', contributors: ['greptime'] })` and `PIKKU_GREPTIME_URL`; it refuses to start without it.
