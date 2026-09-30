---
type: decision
title: A step's compensation runs as a durable step of its own, declared on the function
description: A refund or rollback must not fire twice on replay, so it is recorded as `<step>:compensate`; `onError` is gone
tags: workflow
---

# A step's compensation runs as a durable step of its own, declared on the function

A function declares `compensate` inline on `pikkuFunc`. When a workflow unwinds,
`driveUnwind` (`workflow-compensation.ts`) runs it as the step
`<step>:compensate` through the same RPC path as a forward step. Durability is
the point: a compensation is typically a refund or a rollback, and a bare invoke
would fire again on every replay. Recorded as a step, a second pass finds it
`succeeded` and returns the cached result. It uses the forward step's retry
defaults, and a compensation cannot itself be compensated.

`runPikkuFunc` and the RPC resolver derive the `<id>:compensate` function from
the forward config lazily, so nothing extra is registered, and it is never
exposed. What to undo, and in what order, is decided by the pure `planUnwind`
from the recorded step rows — never from in-memory state, so a crash mid-unwind
resumes at the next compensation.

`onError` (DSL option and graph node field) was removed. Graph nodes recover
with `recover`, which takes precedence over compensation.

**What this rules out:** invoking the compensation inline "since it's just
cleanup", compensating a compensation, a second unwind of a settled run, and
swallowing the original failure because a handler succeeded.
