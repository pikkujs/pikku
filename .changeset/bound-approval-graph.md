---
'@pikku/inspector': patch
'@pikku/inspector-go': patch
---

A `workflow.approval` whose outcome is bound to a variable now appears in the workflow graph and `plannedSteps`, so branching on the decision works and PKU644 no longer fires on a gated workflow. Both inspector engines only read the gate as a bare `await workflow.approval(...)` or an assignment, never as `const decision = await workflow.approval(...)`. Destructuring the outcome now fails with PKU641 instead of losing the gate, and a gate assigned to a variable declared with a literal stays a gate. See docs/MIGRATION.md.
