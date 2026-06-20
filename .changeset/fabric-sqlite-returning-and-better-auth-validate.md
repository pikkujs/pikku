---
'@pikku/cli': patch
---

fix(cli): dev sqlite dialect now reads `INSERT ... RETURNING` rows. The node:sqlite-backed dialect set `reader` from `stmt.reader`, which node:sqlite always leaves undefined, so kysely ran returning-inserts via `.run()` and dropped the rows — breaking better-auth sign-up (it inserts a row and reads it back) with "Failed to create user". `reader` is now derived from the SQL (`SELECT` or `RETURNING`).

feat(fabric-validate): warn when a better-auth `createAuthClient` baseURL omits the `/auth` segment. The Fabric edge (and the sandbox Caddy) keep the `/api` prefix for the better-auth unit, so the DEFAULT server basePath `/api/auth` is correct and needs no override. The real footgun is the client: better-auth appends the endpoint to baseURL verbatim, so a bare `/api` baseURL yields `/api/sign-in/email` (no `/auth`) and 404s. `pikku fabric validate` now warns and suggests `baseURL: \`${apiUrl()}/auth\``.
