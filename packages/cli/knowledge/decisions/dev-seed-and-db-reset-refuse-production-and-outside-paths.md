---
type: decision
title: Dev seed and db reset refuse NODE_ENV production and database paths outside the runtime directory
description: pikku dev seed and pikku db reset throw when NODE_ENV is production, and the SQLite and PGlite reset also refuse a database path outside the runtime directory
tags: cli, db, dev, safety
---

# Dev seed and db reset refuse NODE_ENV production and database paths outside the runtime directory

`devSeed` in `packages/cli/src/functions/db/local-db.ts` throws when `NODE_ENV` is `production`
(`local-db.ts:783-787`). The message says seed data is test data and only runs in dev.

`reset` throws the same way (`local-db.ts:832-836`). For SQLite it computes the path relative to the
runtime directory and throws when the file is outside it (`local-db.ts:838-844`). For PGlite it does the
same with `pgliteDir` (`local-db.ts:863-872`).

The MySQL and Postgres branches of `reset` have no path check (`local-db.ts:849-861`, `local-db.ts:879`).

**What this rules out:** a reset under `NODE_ENV=production`, and a reset of a SQLite or PGlite file
outside the runtime directory. It does not cover a MySQL or Postgres URL.
