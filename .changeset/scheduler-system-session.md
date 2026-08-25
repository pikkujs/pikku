---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Let a scheduled task declare the session it runs as.

`wireScheduler` now takes an optional `session`. A cron has no caller, so
without one it runs with no session at all: it cannot pass a permission or
scope gate, and nothing it writes can be attributed. Declaring a system
identity lets a task be a thin `rpc.invoke('someGatedRpc')` against the same
entry point a person calls, instead of factoring the logic out to a helper
purely to route around the missing session.

A session passed to `runScheduledTask({ name, session })` still wins over the
declared one.
