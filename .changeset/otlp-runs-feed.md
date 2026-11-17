---
'@pikku/core': patch
'@pikku/cli': patch
---

The live runs feed is a built-in of `pikku dev` and, when `liveRuns` is `true` in `pikku.config.json`, of `pikku serve`: `GET /otlp/runs/snapshot` and the SSE stream `GET /otlp/runs/stream`, both requiring the `otlp:runs` scope (no session is 401, a session without it is 403). `@pikku/core/otlp/runs` now ships the listener, `registerOtlpLive`, next to `createRunStitcher`, plus `OTLP_RUNS_SCOPE`, `OTLP_RUNS_TOPIC` and `otlpRunsScopeDefinition`. A project that declares its own `otlp` scope root keeps it.
