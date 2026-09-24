---
'@pikku/cli': patch
---

`pikku all` writes `db/schema.gen.ts` from the migrations when it is missing, so `#pikku/db/schema.gen.js` resolves on a fresh project before `pikku db migrate` has run. `pikku db migrate` no longer logs a Better Auth "Database schema mismatch" for the scratch database it reads the auth schema from.
