---
'@pikku/core': patch
'@pikku/addon-kysely': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
'@pikku/cloudflare': patch
'@pikku/skills': patch
---

Workflow recovery finishes three kinds of run it used to leave stuck: a parent whose child settled without telling it, a run left `compensating`, and a `suspended` run whose approval was decided but never resumed. Neither replaying a parent nor redelivering its step job starts a second child, and a new attempt at a step no longer keeps the previous attempt's child run id.
