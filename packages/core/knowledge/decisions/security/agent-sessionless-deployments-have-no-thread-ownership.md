---
type: decision
title: Agent thread ownership fails closed when there is no principal
description: A sessionless caller gets an ephemeral owner and reaches no stored thread, rather than reaching all of them
tags: agent
---

# Agent thread ownership fails closed when there is no principal

`canAccessThread` returns `false` and `threadOwnerConstraint` returns `[]` when
the session carries neither `userId` nor `orgId`
(`packages/core/src/wirings/agent/agent-prepare.ts`).
`resolveOwnerResourceId` never accepts the client-supplied `resourceId` as an
ownership key; without a principal it mints an ephemeral `anon-<uuid>` owner
memoized on the request's params object.

Agent wirings default to `auth: false`, so "no session" is the common case
rather than an exotic one. Treating it as "no ownership model to enforce" made
every ownership check vacuous: a caller named any `resourceId` and reached that
thread, and because `undefined` on `AgentRunService.listThreads` means _no
filter_ rather than _no rows_, a sessionless `getAgentThreads` returned every
thread in the deployment. The ephemeral owner is what keeps one-shot
conversations working while denying continuity — it is unguessable, so nothing
stored can be reached, and it is stable within a request, so a sub-agent
re-entering `resolveOwnerResourceId` reuses its parent's thread.

Memoizing on the params object rather than a module-level Map is what keeps this
serverless-safe: the identity dies with the request and is never shared between
instances. `canAccessThread` stays a predicate rather than an assertion so it can
back a `pikkuPermission` — authorization belongs in a function's `permissions`
field, never in its body.

**What this rules out:** returning `undefined` from `threadOwnerConstraint` for
any caller; deriving `owners` from request input instead of the session; reading
`auth: false` as permission to skip ownership on a _stored_ thread; and
persisting the anonymous owner anywhere, which would turn an ephemeral identity
into a forgeable one. Cross-request thread continuity without a session is not
available by design — wire a session to get it back. See
[[an-empty-owners-constraint-matches-nothing]].
