---
type: decision
title: Whether a run is inline is read from the run record
description: The runContexts map is a read-through cache over WorkflowRun.inline and a lifetime for replay ordinals, never the answer to what a run is
tags: workflow, state
---

# Whether a run is inline is read from the run record

`PikkuWorkflowService.isInline` resolves `WorkflowRun.inline` from the store and
caches it on the process-local `runContexts` entry for the duration of the
execution that is running the step. `registerInlineRun` / `unregisterInlineRun`
prime and evict that cache; they no longer decide anything. Both callers pass
the same `shouldInline` to `createRun` that they pass to `registerInlineRun`, so
the prime is only ever a saved read.

`inline` decides two forks: whether a failed step retries in-process or is
handed to the queue, and whether a sleep blocks here or goes to the
`schedulerService`. Answering them from a `Map` that only the instance that
called `startWorkflow` ever populated makes both forks instance-dependent. On
Lambda, Workers, or any multi-instance container deployment, instance B reads an
empty map, concludes the run is queued, and dispatches an orchestrator job for a
run instance A is already driving in-process — two executors on one run. The
durable field is the only thing every instance can agree on.

`isInline` is therefore `async`. Its four call sites — `inlineStep` and
`scheduleSleep` in core, `dispatchStep` and `scheduleSleep` in the Cloudflare
Durable Object service — were already `async`, so nothing had to become
asynchronous to accommodate it. Resolving it through `getRunIdentity` means a
run job that already read its run pays no second read, and caching the answer on
the context bounds a step worker to one read. `WorkflowRun.inline` is written
once at `createRun` and never mutated, so a cached value cannot go stale.

The same entry carries per-replay ordinals, the last step name, and the step
snapshot. Those are genuinely process-local — they exist to give
`name`, `name#1`, `name#2` to repeated reaches of one logical step within a
single walk of a workflow, and to let a replay read its rows once. Their
lifetime is now an explicit `activeExecutions` count incremented by
`runWorkflowJob` and by `executeWorkflowStep` and decremented in their `finally`
blocks; the entry is deleted when the count reaches zero, and a terminal
`updateRunStatus` that arrives mid-execution defers to that. Previously
`nextStepKey` lazily created a `replay` object on every step invocation while
`releaseContext` refused to free any entry that had one, so any step reached
outside a `beginReplay` bracket — a graph node's RPC using its workflow wire
from the step-worker queue — stranded an ordinals map and a step-state snapshot
for the life of the process.

Resetting ordinals per execution rather than letting them accumulate across
separate step-worker invocations also makes step naming independent of how the
work happened to be distributed. Two step workers in one process used to see
different ordinals than the same two workers on different instances.

**What this rules out:** answering `isInline` from the map alone and defaulting
to `false` on a miss, which is the split-brain; a synchronous `isInline` backed
by a cache nothing guarantees is populated; keeping a run's entry alive because
a value is cached in it, since a cache that is never evicted is a leak; and
mutating `WorkflowRun.inline` after creation, which the cache is only safe
because nothing does.
