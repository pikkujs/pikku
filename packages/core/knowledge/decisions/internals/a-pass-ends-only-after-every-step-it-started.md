---
type: decision
title: A pass ends only after every step it started
description: A DSL or inline graph pass waits for all its steps before letting go of the run, writes the run's outcome first when it failed or was stopped, and ends its own sleeps and retry delays on a cancel
tags: workflow, reliability
---

# A pass ends only after every step it started

A body that runs steps side by side can end while some are still running:
`Promise.all` rejects on its first failure. A pass that released the run lease
there would leave a step with nothing to answer for it. The unwind waits on that
step, and nothing comes back for an inline run once the step ends. So the pass
waits for every step it started (`PassSteps`, and the same for an inline graph).

- A failed, cancelled or suspended pass writes the run's status first and waits
  after. The closed run then refuses whatever a surviving branch asks for next,
  and a sibling's next retry. A body that returned waits before `completed`.
- A step asked for after the pass has ended is rejected and never starts.
- A DSL run that failed beside a step still running reads as unwinding until the
  pass has outlived it. If there was nothing to undo, it is then `failed`, and the
  caller gets the error.
- The unwind that waited on a sibling is driven once the pass has let go
  (`RunUnwinds.runPass`). An inline graph pass drives it while it still holds the
  lease, after its nodes end.
- A body cannot abandon a step by racing it: the pass waits for the loser too.

Waiting makes a pass's own waits matter. An inline sleep and an inline
`retryDelay` end early on a cancel (`waitUnlessCancelled`), seen at once in this
process and by reading the run from another. A cancelled sleep is not completed.
A cut-short `retryDelay` goes on to the next start, which is refused and gives
the pending attempt its outcome. A failure elsewhere is not a cancel and cuts
neither short.

A store may also refuse a step start because the run was stopped. That reads as
the same refusal a lost step does, so `startUnlessStopped` reads the run: on a
stopped run the pass ends cancelled and drives what is left to unwind. Read as
lost ownership it would write nothing and skip the unwind.

**What this rules out:** `Promise.all` over steps in the engine with nothing
waiting for the rest, a wait inside a pass that a cancel cannot end, and treating
every refused start as another owner's step.
