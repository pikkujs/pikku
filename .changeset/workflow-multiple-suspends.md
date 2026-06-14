---
"@pikku/core": patch
---

fix(core): allow multiple independent suspend points in one workflow

`getSuspendStepName()` returned the constant `'__workflow_suspend'` for every
`workflow.suspend()` call, so all suspends in a run shared a single step row.
Once the first suspend resolved (row → `succeeded`), every later `suspend()`
read that same `succeeded` row and fell straight through without pausing — so a
workflow could only ever have one working suspend point, and a second one (e.g.
wait-for-build, then wait-for-approval) was silently skipped.

The suspend step is now keyed on its `reason` (used raw, just namespaced so it
can't collide with a `do`/`sleep` step of the same name), so each distinct
reason is its own step row. A workflow can now have multiple independent
suspends, including dynamic reasons in loops (`suspend(`Wait for ${i}`)`),
exactly like dynamic `do()` step names. As with `do()`/`sleep()`, the reason is
the suspend's stable identity and must be derived deterministically so it
matches on replay. `suspend(reason)` is unchanged at the call site.
