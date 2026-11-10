---
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

A `pikkuWorkflowFunc` body that uses a construct the workflow graph cannot show now fails with `PKU641` instead of being dropped from the graph while still running on replay. Newly rejected: `forEach`, `reduce` and a bare `map` that wraps workflow calls or stands as a statement, ternary expressions (use `if`/`else`), a `Promise.all(x.map(...))` that does not match the parallel fanout shape (the message says which part did not), and what replay would repeat: `Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()` and `await` of a call that is not a workflow step. `for..of` and `Promise.all(items.map(...))` stay valid, and `pikkuWorkflowComplexFunc` and scenarios are unchanged. The `online-shop` checkout and the field-service quote approval and a few verifier workflows were rewritten to match. See `docs/MIGRATION.md`.
