---
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

A `pikkuWorkflowFunc` body that uses a construct the workflow graph cannot show now fails with `PKU641` instead of being dropped from the graph while still running on replay. Newly rejected: `forEach`, `reduce` and a bare `map` that wraps workflow calls or stands as a statement, ternary expressions (use `if`/`else`), and a `Promise.all(x.map(...))` that does not match the parallel fanout shape (the message says which part did not). `for..of` and `Promise.all(items.map(...))` stay valid, and `pikkuWorkflowComplexFunc` and scenarios are unchanged. The `online-shop` checkout and a few verifier workflows were rewritten to match. See `docs/MIGRATION.md`.
