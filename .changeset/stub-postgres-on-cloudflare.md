---
'@pikku/cli': patch
'@pikku/deploy-cloudflare': patch
---

perf(deploy): stub the Postgres driver out of Cloudflare worker bundles

Templates construct their Kysely instance from `DATABASE_URL`, branching on the
URL scheme: a `postgres://` URL pulls in `postgres` + `kysely-postgres-js`, any
other URL uses the libsql/Turso dialect. On Cloudflare the URL is always libsql,
so the Postgres branch is never taken — yet esbuild still inlined the Postgres
driver (~40KB+) into every worker bundle as dead weight.

Adds a `getStubModules()` provider hook (mirroring `getExternals()`): regex
sources for modules the provider's runtime never executes, stubbed to `export {}`
during bundling. The Cloudflare adapter returns `^postgres$` + `^kysely-postgres-js$`.
Unlike `getExternals`, a stub removes the bytes entirely instead of leaving a
bare runtime import to resolve. Applied to worker units only (the server
container keeps Postgres, since it's a real Node process that may use it).
Verified: cloudflare deploy verifier 21/21; a `postgres` import bundles to 48
bytes (was 38,032) once stubbed.
