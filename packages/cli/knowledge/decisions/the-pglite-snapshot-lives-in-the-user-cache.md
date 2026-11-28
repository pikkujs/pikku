---
type: decision
title: The empty PGlite snapshot lives in the user's cache, never in the project
description: Scratch PGlite databases start from a copy of an empty data directory kept under XDG_CACHE_HOME or ~/.cache, so a checked-out repository cannot supply the database
tags: cli, db, pglite, security
---

# The empty PGlite snapshot lives in the user's cache, never in the project

Booting an empty PGlite runs `initdb`, which takes seconds, and a database
command needs several scratch databases. `pristine-snapshot.ts` in
`src/functions/db/postgres/` dumps the first empty database and starts later
ones from that dump.

The copy on disk is `pikku/pglite-<version>.tar.gz` under `XDG_CACHE_HOME`, or
`~/.cache` when that is unset or relative. It is a whole database that the CLI loads and
then computes schemas in, so whoever supplies it can affect the result. A path
inside the project would let a checked-out repository supply it.

Every project shares the snapshot, so it is taken from a boot with no project
extensions: an extension may run SQL as it boots. A project's extensions are
loaded into each database that starts from the snapshot.

The PGlite version is part of the file name, so each version has its own
snapshot. The CLI creates the file with mode `0600` and moves it into place with
a rename. It does not verify the contents: a snapshot that loads is trusted,
and one that fails to load is replaced from a fresh boot. A cache that cannot be
written costs time and does not fail the command.

**What this rules out:** a snapshot in the project directory or `.pikku/`, a
committed snapshot, and a command that fails because the cache is read-only.
