---
'@pikku/core': patch
'@pikku/skills': patch
---

A workflow pass now outlives every step it started.

- A DSL body or inline graph whose step fails no longer ends the pass while a sibling step is still running. The pass waits for it, so the run lease covers it and the unwind compensates it once it ends. A step asked for after the pass has ended does not start, and a run does not complete under a step its body did not await.
- A step start refused because the run was cancelled ends the pass as a cancel and compensates completed work. It is no longer read as the pass having lost the run.
- A sleep or `retryDelay` that an inline run waits out ends once the run is cancelled.
