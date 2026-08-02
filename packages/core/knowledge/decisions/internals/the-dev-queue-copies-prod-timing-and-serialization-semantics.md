---
type: decision
title: The dev queue copies prod timing and serialization semantics
description: InMemoryQueueService dispatches via setTimeout, retries with backoff, and JSON round-trips every payload so dev behaviour matches a real backend
tags: services
---

# The dev queue copies prod timing and serialization semantics

`InMemoryQueueService` (`packages/core/src/services/in-memory-queue-service.ts`)
is the local/dev queue, and it is deliberately less direct than it could be. It
schedules jobs on the macrotask queue via `setTimeout` rather than calling the
worker inline, it redelivers a failed job up to `options.attempts` times with
backoff, and it JSON round-trips every payload on the way in.

Each is there so dev does not teach a false lesson. Inline dispatch would make
enqueue synchronous, and code written against that ordering breaks the first time
it meets a real queue. Dropping a job on its first error would hide that a
transiently-failing workflow step recovers fine on pg-boss or BullMQ. And every
real backend puts the job on a wire — an SQS body, a Redis value, a `jsonb`
column — so the worker never receives the caller's live object; round-tripping
here means a payload carrying a `Date`, a class instance or a shared mutable
reference fails in dev rather than in production. Callers cannot know which
backend they are talking to, so they must not have to serialise defensively.

**What this rules out:** "optimising" the dev queue by invoking the handler
directly, skipping the JSON copy for speed, or short-circuiting retries. Its job
is fidelity, not throughput. (Separately, the detached `setTimeout` makes this
service unusable on Lambda or Workers, where the container freezes at response
time — it is a dev service by construction, not just by name.)
