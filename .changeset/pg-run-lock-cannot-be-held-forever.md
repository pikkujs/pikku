---
'@pikku/kysely-postgres': patch
---

fix(kysely-postgres): bound the workflow run lock, and never pool a held one

`withRunLock` takes a session-level advisory lock so the critical section can be
the whole workflow body — right, because that body may await a build or an LLM
for minutes, and a transaction lock would leave the connection `idle in
transaction` for the duration. What a session lock does not come with is a
bound: nothing reclaims it while the process lives, so a body that never settles
never reaches the `finally` that unlocks, and every later message for that run
pays `lock_timeout` before failing. Enough of them and a bounded worker pool is
entirely queued behind runs that will never finish.

Three opt-in guards now supply the bound the primitive lacks, each answering a
different way to lose a holder:

- `maxLockHoldMs` gives up on a body that hangs in-process, releases the lock
  and rejects with `RunLockHoldTimeoutError`. The abandoned body keeps running —
  a promise cannot be cancelled — so this trades serialisation for liveness;
  `claimStepForExecution`, not the run lock, is what keeps a duplicated
  orchestration from becoming a duplicated side effect.
- `lockIdleTimeoutMs` sets `idle_session_timeout` on the lock session so
  Postgres reclaims a holder that vanished without closing its connection. It
  ships with a keepalive on the same connection, because a body legitimately
  awaiting a twenty-minute build looks exactly as idle to the server as a dead
  one — setting the GUC by hand, on the role or in the connection string, reaps
  legitimate holders and hands the run to a second worker.
- An unlock that throws now terminates its own backend rather than return a
  connection to the pool still holding the lock.

All three are off by default, so nothing changes for an existing deployment
until it opts in.
