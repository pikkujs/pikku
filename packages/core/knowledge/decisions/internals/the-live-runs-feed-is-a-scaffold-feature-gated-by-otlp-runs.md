---
type: decision
title: The live runs feed is a scaffold feature gated by pikku:otlp:runs
description: scaffold.otlpRuns generates GET /otlp/runs/snapshot, the SSE stream /otlp/runs/stream and the pikku:otlp:runs scope into the project; pikku dev and pikku serve start the feed only for a project that turned it on
tags: core, cli, observability, security
---

# The live runs feed is a scaffold feature gated by pikku:otlp:runs

The live run feed is generated into the project by `scaffold.otlpRuns`, off by
default. Core owns the listener, the topic and the payload; the CLI owns the
holder; the project owns the routes and the scope.

- **Generated, not built into the CLI.** The scaffold file declares the
  `pikku:otlp:runs` scope with `defineScope`, the two functions and the two
  routes. A project that leaves it off has no scope and no routes, and the CLI
  itself needs no scope store, so `pikku all` runs against a database with no
  scope tables. Custom code does not belong in core, the CLI source or the
  inspectors.
- **Closed by default.** Both routes require a session (401) and `pikku:otlp:runs`
  (403); the stream's subscribe function runs before it opens. The routes sit
  behind a group middleware that answers 404 unless a command started the feed
  in this process. `pikku dev` and `pikku serve` start it only for a project
  whose scaffold feature is on, and not when telemetry is off
  (`PIKKU_TELEMETRY=0`), which is also the supervising parent of several
  backends.
- **The holder is a public CLI path.** The scaffold reads the live feed through
  `@pikku/cli/otlp-runs`, the module `registerOtlpRuns` sets it on. The scaffold
  imports the CLI, so a deployed bundle should leave the feature off.
- **The scope tree is under the `pikku` root.** A bare `otlp` root of an app plus
  an ancestor grant would otherwise satisfy it.
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
