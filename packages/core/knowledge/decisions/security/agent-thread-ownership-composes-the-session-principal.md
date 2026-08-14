---
type: decision
title: An agent thread key is always prefixed with the trusted principal
description: Ownership keys are composed as principal:resourceId, so a client id can sub-divide its own boundary but never widen it
tags: agent
---

# An agent thread key is always prefixed with the trusted principal

`resolveOwnerResourceId` in `packages/core/src/wirings/agent/agent-prepare.ts`
composes the ownership key for a thread or run as `principal:resourceId`. The
principal is the trusted one — `session.userId` for the default `'user'`
`SessionScope`, `session.orgId` for `'org'` — and the client-supplied
`resourceId` is only ever a sub-partition inside it. Composition is idempotent:
a value already inside the caller's namespace (top-level re-entry, sub-agent
recursion, resume — all of which pass an already-composite id) is returned
unchanged rather than composed twice.

`'org'` scope with no org on the session throws `ForbiddenError` instead of
falling back to a bare or shared key, because a shared key leaks threads across
organizations. A sessionless `'user'` wiring has no trusted principal at all and
falls back to the requested `resourceId` as a best-effort partition.
`isOwnedByPrincipal` requires the `:` separator when matching sub-partitions so
that a principal `alice` does not match a lookalike `alice-evil:…` key.

**What this rules out:** storing threads under the client's `resourceId`
directly; making the composition non-idempotent (resume and sub-agent recursion
would double-prefix and lose their own threads); testing ownership with a bare
`startsWith(principal)` that omits the separator; and letting `'org'` scope
degrade to a shared key when the session carries no organization.
