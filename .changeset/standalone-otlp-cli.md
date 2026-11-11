---
'@pikku/cli': patch
---

`pikku serve` exports telemetry from `PIKKU_OTLP_*`. The `.pikku/runs` sampler and run-telemetry middleware are removed from `pikku dev` and `pikku all`. See docs/MIGRATION.md.
