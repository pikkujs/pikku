---
type: decision
title: Queue group concurrency keeps one shared queue fair
description: Per-group slot caps let many producers share a single queue instead of one queue each, at the cost of a cap that must stay under batchSize
tags: queue
---

# Queue group concurrency keeps one shared queue fair

`PikkuWorkerConfig.groupConcurrency` in
`packages/core/src/wirings/queue/queue.types.ts` caps how many jobs of any one
group (`JobOptions.group`, a `JobGroup` with an `id` and optional `tier`) may run
at once. Jobs sharing a group `id` count against the same limit;
`GroupConcurrencyConfig.tiers` varies the limit per tier so a slow group can be
allowed more or fewer slots than the default.

The alternative considered was one queue per producer, which gives isolation for
free. It was rejected because pull-based backends poll per queue, so splitting
multiplies polling cost linearly with the number of producers. A single shared
queue plus a per-group cap gets the same "no one producer starves the others"
property at constant polling cost. The cap must not exceed
`PikkuWorkerConfig.batchSize`, which is the worker's total concurrency — a group
limit above it can never bind and silently reverts the queue to unfair.

**What this rules out:** dropping `group`/`groupConcurrency` in favour of
per-producer queues, and raising a group limit to or above `batchSize` as a way
to "disable" fairness — that reintroduces head-of-line blocking by a single
producer rather than turning the feature off.
