---
'@pikku/kysely-postgres': patch
---

Stop a workflow run's lock from starving the query pool.

A Postgres advisory lock lives on a connection and `withRunLock` spans the whole
workflow body, so every in-flight run held one connection of the pool the rest
of the app queries through for as long as it ran — external I/O included. At N
concurrent runs, N being the pool size, every other request queued behind them
forever: not an error, a hang. Twenty concurrent teardown workflows took a
production backend down this way, and it only came back on a restart.

`PgKyselyWorkflowService` now accepts `lockDb`, a second Kysely instance on its
own pool used only for the run lock. That pool's size becomes the cap on
concurrent runs per process — run N+1 waits for a lock connection instead of
starving request serving. `lockTimeoutMs` bounds that wait so a jam surfaces as
a failed run rather than a process that never finishes one.

Both default to the previous behaviour: with no `lockDb` the lock is still taken
on the query pool, and the wait is still unbounded.

`withStepLock` is unchanged and stays on the query pool — its caller claims the
step under the lock and runs the step outside it, so it holds a connection for a
few statements rather than for the step's work.
