---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/deploy-standalone': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/kysely': patch
---

OTLP and analytics sink registries. Core creates `otlpSinks` and `analyticsSinks` before `createSingletonServices` in `pikku dev`, `pikku serve` and standalone builds; an app registers sinks in plain code with `add(sink, map)`. The tracer is always real (the endpoint only controls the HTTP sink) and spans are skipped while no sink is registered. Removed: the `analyticsService` registration, `AnalyticsSink` with `accepts`, and the exporter-typed tracer, logger and metrics constructors. See docs/MIGRATION.md.
