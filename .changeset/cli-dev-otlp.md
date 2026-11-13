---
'@pikku/cli': patch
---

`pikku dev` now sends logs, traces and metrics over OTLP when `PIKKU_OTLP_ENDPOINT` is set, exactly as `pikku serve` does (same `PIKKU_OTLP_*` variables, loopback-only unless `PIKKU_OTLP_ALLOW_REMOTE=1`, inert when unset or `PIKKU_TELEMETRY=0`). Until now only `serve` built the runtime telemetry, so a dev server ignored the variables and a host that sets them for it (Pikku Studio) got no data. With several backends the parent process serves nothing and leaves it to its backends.
