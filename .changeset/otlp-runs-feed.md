---
'@pikku/core': patch
'@pikku/cli': patch
---

The live runs feed is a built-in of `pikku dev` and, when `liveRuns` is `true` in `pikku.config.json` (a boolean; any other value is refused), of `pikku serve`: `GET /otlp/runs/snapshot` and the SSE stream `GET /otlp/runs/stream`, both requiring the `pikku:otlp:runs` scope (no session is 401, a session without it is 403). `@pikku/core/otlp/runs` ships the listener, `registerOtlpLive`, next to `createRunStitcher`, plus `OTLP_RUNS_SCOPE`, `OTLP_RUNS_TOPIC` and `otlpRunsScopeDefinition`. The scope is part of the project's declared scopes (generated `ScopeId`, scopes meta, `scopes prune` and `scopes audit`). A subscribe function can now only subscribe a topic its own `subscribe.topicPattern` matches, the `otlp.runs` topic never crosses an event hub relay, and `reloadGeneratedMeta` takes `onHttpMetaReplaced` so routes a host registers at runtime survive a reload without a gap.
