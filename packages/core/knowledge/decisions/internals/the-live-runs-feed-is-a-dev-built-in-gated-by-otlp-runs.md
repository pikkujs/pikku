---
type: decision
title: The live runs feed is a dev built-in gated by pikku:otlp:runs
description: pikku dev serves GET /otlp/runs/snapshot and the SSE stream /otlp/runs/stream; pikku serve only with liveRuns in pikku.config.json; both require the pikku:otlp:runs scope
tags: core, cli, observability, security
---

# The live runs feed is a dev built-in gated by pikku:otlp:runs

The live run feed is wired by the CLI at runtime, not generated into the project.
The code defines the routes, the topic and the payload.

- **Registered at runtime, not generated.** Like the scenario instrumentation, so
  a deployed bundle never carries a data surface over its own traces. An addon
  cannot wire HTTP (PKU920), which is why it lives in the CLI.
- **Closed by default.** Both routes require a session (401) and `pikku:otlp:runs`
  (403); the stream's subscribe function runs before it opens. `pikku dev` has
  it; `pikku serve` only with `liveRuns: true`. Neither runs when telemetry is
  off (`PIKKU_TELEMETRY=0`), which is also the supervising parent of several
  backends.
- **Re-register inside the meta reload.** `reloadGeneratedMeta` replaces the HTTP
  meta and calls `onHttpMetaReplaced` in that same synchronous step, so the
  routes have no gap; the listener is made once per sink registry (a
  `WeakMap`), so this adds no second sink.
- **The scope tree is core's, under the `pikku` root.** A bare `otlp` root of
  an app plus an ancestor grant would otherwise satisfy it.
  `projectScopeDefinitions` adds `otlpRunsScopeDefinition()`, so generated
  `ScopeId`, the scopes meta, `scopes prune` and `scopes audit` all see it;
  `pikku serve` leaves it out unless `liveRuns` is true. The inspector does not
  know it, so a system role granting it needs the project's own `defineScope`
  for `pikku` (PKU124).
- **The topic is guarded by scope, whichever function returns it.** A subscribe
  function reaches only a topic its own `topicPattern` covers, and a
  subscription to the runs topic needs `pikku:otlp:runs`, over SSE and
  WebSocket, again on every sweep. The topic is local to the process: it is
  never relayed in or out.
- **Client order.** Subscribe to the stream first, then fetch the snapshot, then
  drop stream events whose `seq` is at or below the snapshot's. The other order
  loses events that land between the two. Use the same backend instance for the
  stream and the snapshot: `seq` is per process, so another instance's snapshot
  says nothing about this stream.
