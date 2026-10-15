---
type: question
title: Is the agent score worker reachable without a session?
description: The score worker is registered as sessionless with the helper function type, and this file wires no route or expose for it
tags: core, agent, scorer, security
---

# Is the agent score worker reachable without a session?

`packages/core/src/wirings/agent-scorer/agent-scorer-worker.ts:44-56` registers the
worker `pikkuAgentScoreWorker` with `sessionless: true` and `functionType: 'helper'`.
The file adds no HTTP or RPC wiring and no `expose` for it.

Core's meta type lists `'helper'` as one of the function types (`packages/core/src/function/function-meta.types.ts:147`).
The scenario coverage code skips non-user functions (`packages/core/src/wirings/workflow/scenario-coverage.ts:195`).
I did not trace whether a helper is routed over RPC or HTTP, or what gates a
sessionless function on those routes.

**Question:** should the score worker be reachable from outside the process without
a session, and is `helper` what keeps it off the public surface? That is not
settled by this file.
