---
type: decision
title: Inline and queued workflow graph runs share one transition planner
description: A second, weaker inline traversal would lose joins, cycle revisits and step provenance that the queued path has
tags: workflow
---

# Inline and queued workflow graph runs share one transition planner

`planGraphTransitions` in `graph/graph-runner.ts` is the single place that
decides which nodes fire next. `continueGraph` (queued) and
`continueGraphInline` (in-process loop) both call it; they differ only in
whether the planned wave is dispatched via `queueGraphNode` or executed by
`executeGraphNodeInline`. Sharing the planner is what gives the inline path
joins, cycle revisits and `fromStepName` provenance identical to the queue,
instead of a second and weaker traversal. `executeGraphNodeInline` persists
under the same physical instance key and records the same predecessor as
`queueGraphNode` for the same reason.

The planner distinguishes two kinds of edge. A forward edge is node-once: the
target fires only if it has no instance yet, so converging edges (joins)
collapse to a single run. A back-edge — one whose target can reach the source,
detected by `closesCycle` — is a revisit: it fires a fresh ordinal instance
(`target#1`, …) and is edge-once on `from → target` so it does not re-fire every
tick. Cycles terminate when branch routing stops looping back, and every
instance records the predecessor it was reached from.

`remapStepNamesToNodeIds` and `remapBranchKeys` are called on the completed and
branch sets even where their results are discarded: planning keys steps
physically, so those calls exist only to surface an ambiguous template-node
config as an error.

On the queued path a node that sets no `retries` falls back to
`DEFAULT_STEP_RETRIES` rather than to zero, so the persisted step's retry count
matches the queue job's `attempts` (see `resolveStepJobOptions`). A step row
claiming one attempt while the queue silently delivers five is the kind of
disagreement that makes a retry bug unreadable from the outside.

**What this rules out:** writing a separate traversal for the inline path,
making forward edges fire per-edge (which breaks joins) or back-edges fire
node-once (which breaks loops), dropping `fromStepName` from either path, and
deleting the "unused" remap calls as dead code.
