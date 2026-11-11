---
'@pikku/deploy-standalone': patch
---

The generated standalone entry builds runtime telemetry from `PIKKU_OTLP_*` (per-signal headers, process metrics, OTLP log sink) and passes the tracer to the logger, the Kysely factory and the services. No endpoint means no exporter. The loopback guard is unchanged.
