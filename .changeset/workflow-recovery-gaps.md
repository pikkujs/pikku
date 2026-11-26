---
'@pikku/core': patch
'@pikku/addon-kysely': patch
---

Workflow recovery finishes three kinds of run it used to leave stuck: a parent whose child settled without telling it, a run left `compensating`, and a `suspended` run whose approval was decided but never resumed. Replaying a parent whose child is still running no longer starts a second child, and a new attempt at a step no longer keeps the previous attempt's child run id.
