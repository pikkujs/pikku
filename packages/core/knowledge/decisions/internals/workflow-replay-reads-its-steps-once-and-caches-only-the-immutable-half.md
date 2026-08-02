---
type: decision
title: A workflow replay reads its steps once and caches only the run's immutable half
description: The per-replay snapshot collapses O(N^2) step reads to one, but caching mutable run fields would make the replay read a lie
tags: workflow
---

# A workflow replay reads its steps once and caches only the run's immutable half

A DSL replay walks the workflow body from the top, and each step it passes asks
for its own row — so a run of N steps costs N reads per replay and O(N^2) over
its lifetime. `beginReplay` in `pikku-workflow-service.ts` opens a pass by
calling `listStepStates`, which backends able to answer in a single query
override; `loadOrCreateStep` then serves every step from that snapshot. This is
safe because a pass reaches each step key at most once and the steps it replays
past are `succeeded`, and therefore immutable.

`getRunIdentity` caches the run for the same pass, but only for its immutable
half — which workflow it is, the wire it was started on, its input. Anything
needing `status`, `output`, `error` or `state` must call `getRun`: those move
while the run executes and a cached copy would be a lie. The `replay` half of
`RunContext` is rebuilt from scratch on every orchestrator tick and torn down by
`endReplay`.

`loadOrCreateStep` also handles a concurrent replay creating the row after the
snapshot was taken: if `create()` throws, it re-reads the step, and only if that
read also fails does it rethrow the original — because in that case the insert
failed for its own reasons and that error is the one worth seeing.

**What this rules out:** widening the snapshot to cover mutable run fields,
keeping it across orchestrator ticks, or removing the re-read fallback in
`loadOrCreateStep` on the grounds that a duplicate insert "cannot happen".
