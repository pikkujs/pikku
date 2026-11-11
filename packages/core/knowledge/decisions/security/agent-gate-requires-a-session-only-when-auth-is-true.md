---
type: decision
title: An agent requires a session unless auth is false, and always enforces scopes and permissions
description: Agents take the function default, so crons and queue workers need an explicit auth false; scopes are an AND gate checked before any permission I/O
tags: agent
---

# An agent requires a session unless auth is false, and always enforces scopes and permissions

`assertAgentAuthorized` in
`packages/core/src/wirings/agent/agent-prepare.ts` enforces, in order:
session presence (unless `CoreAgent.auth === false`), then `scopes`, then
`permissions`. The ordering mirrors the function runner — scopes AND together so
they can only narrow access, and a missing scope short-circuits before any
permission function does I/O. Declared `scopes` are narrowed to the generated
`ScopeId` union in a project's `#pikku/scopes`, so an undeclared scope is a
compile error.

`auth` used to default to `false`, on the reasoning that an agent is normally reached
from a function that already enforced its own auth. That left an exposed agent open
to anyone. It now takes the same default as a function, and a cron or queue worker
says `auth: false`. Global permissions are evaluated here too rather than assumed to have
already run, because an agent is reachable from entry points that never pass
through the function runner; re-evaluating an AND gate of side-effect-free
predicates is idempotent.

See [[a-workflow-or-agent-is-a-function-and-its-declaration-decides]].

**What this rules out:** an open default; checking permissions
before scopes; skipping globals on the assumption a caller already ran them; and
moving the gate into the individual run/stream/resume entry points, where a new
entry point would silently miss it.
