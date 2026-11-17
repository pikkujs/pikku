---
type: decision
title: The live runs feed is a dev built-in gated by otlp:runs
description: pikku dev serves GET /otlp/runs/snapshot and the SSE stream /otlp/runs/stream; pikku serve only with liveRuns in pikku.config.json; both require the otlp:runs scope
tags: core, cli, observability, security
---

# The live runs feed is a dev built-in gated by otlp:runs

`registerOtlpLive` (`@pikku/core/otlp/runs`) feeds the run stitcher from the
process's own OTLP sink on a timer, off the request path, and publishes batches
`{ v: 1, events }` to the event hub topic `otlp.runs`. The CLI wires the routes
from `packages/cli/src/functions/wirings/otlp/register-otlp-runs.ts`.

- **Registered at runtime, not generated.** Like the scenario instrumentation, so
  a deployed bundle never carries a data surface over its own traces. An addon
  cannot wire HTTP (PKU920), which is why it lives in the CLI.
- **Closed by default.** Both routes require a session (401) and `otlp:runs`
  (403); the stream's subscribe function runs before it opens. `pikku dev` has
  it; `pikku serve` only with `liveRuns: true`. Neither runs when telemetry is
  off (`PIKKU_TELEMETRY=0`), which is also the supervising parent of several
  backends.
- **Re-register after a meta reload.** `reloadGeneratedMeta` replaces the HTTP
  meta, so the routes' meta is put back after it; the listener is made once per
  sink registry (a `WeakMap`), so this adds no second sink.
- **The scope tree is core's.** `otlpRunsScopeDefinition()` is added to the
  scopes a dev or served process syncs, unless the project declares an `otlp`
  root itself. The inspector does not know it, so a system role granting
  `otlp:runs` needs the project's own `defineScope` for `otlp` (PKU124).
- **The stitcher source test skips `live.ts`.** The listener owns the clock; the
  stitcher stays free of it.
