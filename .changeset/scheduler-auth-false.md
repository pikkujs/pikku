---
'@pikku/core': patch
---

Stop the scheduler declaring `auth: false` for every task.

A task whose middleware sets a session runs a session-taking function, and the
hardcoded `auth: false` made the runner log "requires a session but auth was
explicitly disabled — use pikkuSessionlessFunc instead" on every single run.
Nothing else changes: a task with no session still throws `MissingSessionError`
when its function needs one.
