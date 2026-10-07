---
'@pikku/cli': minor
---

Add `pikku mocks sync`, which writes `.mocks/mocks.lock.json` with the shape of every mock and of the function behind it (sorted keys, so the file is stable in git). It refuses to write while any RPC is invalid. `pikku mocks diff` now also compares against the lock: a mock edited since the last sync shows as changed even if the function still fits, an RPC in the lock with no mocks is reported as removed from the lock, and a missing lock is only a note. `pikku validate` runs the stub release check (`pikku mocks check`) for any project that has a `.mocks/` directory or a stub hook call, and reports its findings through the usual validate output and exit code.
