---
'@pikku/cli': patch
---

fix(cli): dev sqlite dialect now reads `INSERT ... RETURNING` rows. The node:sqlite-backed dialect set `reader` from `stmt.reader`, which node:sqlite always leaves undefined, so kysely ran returning-inserts via `.run()` and dropped the rows — breaking better-auth sign-up (it inserts a row and reads it back) with "Failed to create user". `reader` is now derived from the SQL (`SELECT` or `RETURNING`).

feat(fabric-validate): add two checks for the Fabric `/api`-stripping edge. `pikku fabric validate` now errors when a better-auth wiring keeps the default `/api/auth` basePath (the edge strips `/api`, so auth routes 404 and login breaks — fix: `basePath: '/auth'` + client `baseURL` `/api/auth`), and warns when `createAuthClient` uses a bare `/api` baseURL that omits the `/auth` segment.
