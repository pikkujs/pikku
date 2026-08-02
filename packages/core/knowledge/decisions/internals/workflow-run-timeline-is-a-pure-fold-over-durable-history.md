---
type: decision
title: The workflow run timeline is a pure fold over durable history, with the row's status as the authority
description: No IO in the fold keeps time-travel transport-independent; the terminal event comes from `status`, not from a timestamp every backend populates
tags: workflow
---

# The workflow run timeline is a pure fold over durable history, with the row's status as the authority

`run-timeline.ts` turns `getRunHistory` — one row per step *attempt*, each with
lifecycle timestamps — into a flat, chronologically ordered event stream, and
folds that stream up to any point to recover what the run "knew" then: the same
step cache a replay would hold, plus the walked path. Both functions are pure,
with no IO, so they are trivially testable and the same fold works for the
Redis, Kysely and in-memory stores alike.

The terminal event is driven by the row's authoritative `status`, falling back
to `updatedAt` when the specific stamp is absent, because the lifecycle
timestamps are not populated by every backend — Kysely leaves
`succeededAt`/`runningAt` null. The intermediate `scheduled` and `running`
events are optional enrichment, emitted only when the backend recorded them; the
`pending` event always exists and is the one that carries provenance
(`fromStepName`).

Ordering is defensive: events sort by timestamp, then by `LIFECYCLE_ORDER`, then
by original index, so rows sharing an instant stay deterministic across
backends. In the fold, a retry's `pending` event reopens the step and drops the
prior result and error.

The index conventions are fixed and callers depend on them: `TimelineEvent.seq`
is a monotonic 0-based position, `attempt` is 1-based, and
`reconstructStateAt(at)` is inclusive whether `at` is a seq or a `Date` — a
point before the first event yields the empty initial state with `seq` of `-1`.

**What this rules out:** reading state inside the fold, deriving the terminal
event from `succeededAt`/`failedAt` alone, trusting history to arrive sorted, or
letting a retry's reopening event keep the previous attempt's outcome.
