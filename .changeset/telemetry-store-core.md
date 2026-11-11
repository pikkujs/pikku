---
'@pikku/core': patch
'@pikku/deploy': patch
---

Add the `TelemetryStore` interface and row types to `@pikku/core/telemetry-store` (types only), and `MemoryTelemetryStore` plus the `conformance(store, { ingest })` suite to `@pikku/core/telemetry-store/testing`. The testing subpath imports `node:test`, so it is declared server-tier in the cloud-support data. No new dependency.
