---
type: overview
title: Questions
description: Things about the GreptimeDB telemetry store that need an owner decision
---

# Questions

Something asked and not yet answered. The code makes a choice nobody has stated, so the
doubt is recorded with the current behaviour, not a guessed rationale.

<!-- pikku:knowledge-index -->

- [How should metrics be scoped to a project, when the exporter's metric tables only carry the stage?](how-should-metrics-be-scoped-to-a-project-when-the-exporters-metric-tables-only-carry-the-stage.md) — the store scopes its own metric writes by a pikku_project tag; the app exporter's tables have none, so they are stage-scoped only
- [Should the addon's OTLP encoder be deleted for @pikku/core/otlp once that lands?](should-the-addons-otlp-encoder-be-deleted-for-pikku-core-otlp-once-that-lands.md) — otlp-encode.ts duplicates the encoding on the otlp-exporter branch because core's subpath is not in this base
- [Should a contributor-provided service be a typed key of RequiredSingletonServices?](should-a-contributor-provided-service-be-a-typed-key-of-requiredsingletonservices.md) — telemetryStore is provided at run time but is not in the generated type, so an app reads it through a cast

<!-- /pikku:knowledge-index -->
