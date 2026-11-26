---
'@pikku/core': patch
'@pikku/addon-kysely': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
'@pikku/cloudflare': patch
'@pikku/skills': patch
---

On the Kysely and in-memory stores, workflow recovery now picks up three kinds of run it used to leave stuck: a parent whose child settled without telling it, a run left `compensating` (only its compensation jobs are sent again), and a `suspended` run whose approval was decided but never resumed.

Once a step's child run id is saved, replaying the parent or redelivering the step job leaves the step to that child. Kysely and MongoDB check this in the same write that claims the step; other stores check it when the claim reads the step. Redis and MongoDB now report the child run id when reading a step, and a new attempt at a step no longer keeps the previous attempt's child run id.

Kysely stores a run output of `false`, `0` or `''` instead of dropping it.
