---
'@pikku/cli': patch
---

Compile PGlite's WASM modules once per process instead of once per embedded Postgres instance.

`pikku db migrate` opens several PGlite instances in a single run, each of which
had PGlite load and compile `pglite.wasm` and `initdb.wasm` for itself. The
compiled modules are now built once and shared, which takes a 10.5MB compile off
every run after the first instance. Where the files cannot be resolved — a
bundled CLI, say — PGlite loads them itself exactly as before.
