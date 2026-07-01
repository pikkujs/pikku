---
'@pikku/core': patch
---

fix(workflow): scope the step advisory lock to the claim, not execution

`executeWorkflowStep` held the step's advisory lock — and, in the Postgres
workflow service, the pooled DB connection backing it — across the entire step
body, including the step's own network and DB work. Under concurrency >= the DB
pool size this self-deadlocks: every running step pins a connection on its lock
transaction while its inner queries wait for a connection that never frees, so
nothing makes progress and the API hangs.

The lock is only needed to atomically *claim* a step (read state + mark it
`running`); once a step is `running`, the existing status guard already prevents
any concurrent worker from re-running it. The lock now covers only the claim;
execution and result persistence run with the lock released and the connection
back in the pool.
