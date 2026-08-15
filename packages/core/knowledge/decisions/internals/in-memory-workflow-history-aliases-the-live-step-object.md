---
type: decision
title: In-memory workflow history aliases the live step object
description: stepHistory pushes the same StepState reference that steps holds, so later mutations to a step are visible in its history entry
tags: services
---

# In-memory workflow history aliases the live step object

`InMemoryWorkflowService` (`packages/core/src/services/in-memory-workflow-service.ts`)
stores each step twice: in `steps`, keyed `${runId}:${stepName}`, and appended to
`stepHistory` for the run. Both hold the _same object_. `createStepImpl` and
`createRetryAttemptImpl` push the reference they just put into `steps`, not a
copy.

That aliasing is the mechanism, not an accident. The service mutates a step in
place as it progresses — status, `runningAt`, `completedAt`, output, error — and
every one of those updates has to appear in the run's history without the history
being rewritten. Break the aliasing and history freezes at the moment each step
was created: every entry reads `pending`, and `getRunHistory` reports a run in
which nothing ever finished.

**What this rules out:** pushing `{ ...step }` into `stepHistory`, or introducing
any clone/freeze/structuredClone on the way in — the obvious "don't share mutable
state" cleanup. If history ever needs to be immutable, the step updates have to
start writing to both structures explicitly, in the same change.
