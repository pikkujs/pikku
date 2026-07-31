---
type: decision
title: An agent requires a session only when auth is true, but always enforces scopes and permissions
description: Agents follow pikkuSessionlessFunc semantics so crons and queue workers can run them; scopes are an AND gate checked before any permission I/O
tags: ai-agent
---

# An agent requires a session only when auth is true, but always enforces scopes and permissions

`assertAgentAuthorized` in
`packages/core/src/wirings/ai-agent/ai-agent-prepare.ts` enforces, in order:
session presence (only when `CoreAIAgent.auth === true`), then `scopes`, then
`permissions`. The ordering mirrors the function runner — scopes AND together so
they can only narrow access, and a missing scope short-circuits before any
permission function does I/O. Declared `scopes` are narrowed to the generated
`ScopeId` union in a project's `pikku-types.gen.ts`, so an undeclared scope is a
compile error.

`auth` defaults to `false` (i.e. `pikkuSessionlessFunc`, not `pikkuFunc`) because
an agent is normally reached from a function that already enforced its own auth,
and is also run from genuinely sessionless contexts such as crons and queue
workers. Requiring a session by default would reject those without adding a real
gate. Global permissions are evaluated here too rather than assumed to have
already run, because an agent is reachable from entry points that never pass
through the function runner; re-evaluating an AND gate of side-effect-free
predicates is idempotent.

**What this rules out:** making `auth: true` the default; checking permissions
before scopes; skipping globals on the assumption a caller already ran them; and
moving the gate into the individual run/stream/resume entry points, where a new
entry point would silently miss it.
