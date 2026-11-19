---
'@pikku/core': patch
'@pikku/cli': patch
---

The live runs feed is the scaffold feature `scaffold.otlpRuns`, off by default. When on, `pikku all` writes `otlp/otlp-runs.gen.ts` into the project: the `pikku:otlp:runs` scope (declared by the file's own `defineScope`), `GET /otlp/runs/snapshot` and the SSE stream `GET /otlp/runs/stream`, both requiring that scope (no session is 401, a session without it is 403) and answering 404 unless the process started the feed. `pikku dev` and `pikku serve` start the feed only for a project that turns the feature on; `@pikku/cli/otlp-runs` exports the holder the generated routes read. `@pikku/core/otlp/runs` ships the listener, `registerOtlpLive`, next to `createRunStitcher`, plus `OTLP_RUNS_SCOPE` and `OTLP_RUNS_TOPIC`. A subscribe function can now only subscribe a topic its own `subscribe.topicPattern` matches, and the `otlp.runs` topic never crosses an event hub relay.
