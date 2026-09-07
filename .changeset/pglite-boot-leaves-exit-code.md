---
'@pikku/cli': patch
---

db: stop an embedded-postgres boot from failing the command

PGlite runs Postgres as an Emscripten module, and Emscripten's exit handler
writes the WASM program's status straight to `process.exitCode`. Booting the
embedded database left it at 99 with nothing wrong, and the CLI's bin ends with
`process.exit(process.exitCode ?? 0)` — so any command that merely touched the
embedded database exited 99 *after* completing all of its work and printing a
green summary. `pikku all` in a package with a Postgres schema failed this way
in CI while passing locally, where a real `DATABASE_URL` meant PGlite never
booted.

Restore the previous exit code once the database is ready. The restore uses
`?? 0` because assigning `undefined` does not clear an already-set `exitCode`
under bun.
