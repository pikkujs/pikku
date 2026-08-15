---
type: decision
title: `invocationId` is a workflow step's dedupe key; `stepId` is store-specific and must never be used as one
description: The invocation id is a frozen UUIDv5 of runId + stepName, identical across retries on every backend
tags: workflow
---

# `invocationId` is a workflow step's dedupe key; `stepId` is store-specific and must never be used as one

`deriveInvocationId` (`workflow-invocation-id.ts`) is `uuidv5(runId:stepName)`.
Because both inputs are stable across replays, the same call yields the same
UUID on every attempt and on every storage backend — so a step can
`INSERT … ON CONFLICT (invocation_id)` or pass it as an external idempotency
key (a Stripe key, say) and have a retry of a half-applied side effect collapse
onto the first attempt.

`stepId` cannot do that job. Whether it stays the same or is minted fresh per
attempt is store-specific: the in-memory store mints a new one each attempt
while the SQL store reuses the row. `WorkflowStepWire` documents `invocationId`
as the dedupe key for exactly this reason.

`PIKKU_WORKFLOW_NAMESPACE` in `workflow-invocation-id.ts` is frozen. Changing it
would alter every derived invocation id and break dedupe across a deploy — steps
that already ran would look new. The v5 implementation is hand-rolled (SHA-1
plus the version and variant bit twiddling) rather than pulled from the `uuid`
package, and `workflow-invocation-id.test.ts` pins it against the known
`www.example.com`-in-DNS-namespace vector.

Calling the same step name more than once in a run _is_ disambiguated. Ordinals
are already in: `nextStepKey` (`pikku-workflow-service.ts`) mints a physical key
per reach — `name`, then `name#1`, `name#2` — and every step entry point routes
through it, so `deriveInvocationId` hashes the physical key, not the logical
name. Each reach therefore gets its own row and its own invocation id. The first
reach keeps the bare name, so ids minted before ordinals landed are unchanged,
and the ordinal counters reset at the start of each replay, so a given call site
resolves to the same key on every attempt. `workflow-step-ordinal.test.ts` pins
all three properties.

**What this rules out:** using `stepId` as an idempotency key, regenerating the
namespace UUID, swapping in a different hash or a random id, passing the logical
step name to `deriveInvocationId` instead of the physical key from
`nextStepKey`, or "simplifying" the derivation to include anything that varies
between replays.
