---
type: decision
title: An empty owners constraint matches nothing
description: owners is an authorization boundary, so every storage backend must treat [] as no rows rather than no filter
tags: agent, storage
---

# An empty owners constraint matches nothing

Every `AgentRunService.listThreads` implementation returns `[]` immediately when
`owners` is present and empty — `kysely-agent-run-service.ts`,
`redis-agent-run-service.ts`, `mongodb-agent-run-service.ts`. The conformance
suite in `packages/core/src/testing/service-tests.ts` pins it, so a new backend
inherits the requirement instead of rediscovering it.

`owners` is an authorization boundary, not an optional filter. The natural way
to write a query builder is to skip a clause when its list is empty, which
silently converts "this caller may see nothing" into "this caller may see
everything" — the failure is invisible in review because the omitted clause
looks like an optimization. Placing the guard before the query is built, in
every backend, means the dangerous shape never exists.

This is what makes the sessionless `[]` from `threadOwnerConstraint` safe to
return; the two decisions only hold together.

**What this rules out:** folding the empty case into the query builder's normal
`if (owners)` path; treating `owners: []` as equivalent to `owners: undefined`
at any layer; and adding a backend without the conformance suite.

See [[agent-sessionless-deployments-have-no-thread-ownership]].
