---
type: decision
title: The in-memory workflow service is inline-only and single-process
description: InMemoryWorkflowService wires no queues and implements withRunLock/withStepLock as pass-throughs, because inline execution has no second holder to exclude
tags: services
---

# The in-memory workflow service is inline-only and single-process

`InMemoryWorkflowService` (`packages/core/src/services/in-memory-workflow-service.ts`)
calls `super({ ...options, wireQueues: false })` and implements `withRunLock` and
`withStepLock` as bare `return fn()`. Both look like unfinished work and neither
is.

Every step runs inline in the process that started the run: there are no queue
workers, so no other worker can be mid-step on the same run, and all state lives
in this instance's `Map`s, so no other process can see it to contend for it. A
lock would be excluding a competitor that cannot exist. It is offered for CLI
tools that want step orchestration, for tests, and for single-process apps that
do not need persistence — and the run state is unbounded and lost on restart,
which is the price of that.

**What this rules out:** treating the no-op locks as a bug and adding real
locking here, and running this service anywhere a second process or a queue
worker could touch the same run. A deployment that needs either wants a
persistent `WorkflowService` implementation instead; there is nothing to fix in
this one.
