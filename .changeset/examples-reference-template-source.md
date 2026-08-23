---
'@pikku/core': patch
'@pikku/cli': patch
---

Point the doc's examples at real template source instead of restating it. An `@example snippet: name` names a `// @snippet start name` region in `templates/functions` or `templates/function-addon`, and the surface build resolves it — so every example the doc shows is code that compiled, and renaming an option breaks the build rather than the docs. `wireHTTP`, `wireChannel`, `wireScheduler`, `wireQueueWorker`, `defineSecret`, `defineVariable` and `addError` now carry one.
