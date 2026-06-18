---
'@pikku/cli': patch
---

Add embedded PGlite-backed Postgres support for local dev and DB commands when `db/postgres` is present without a configured `postgresUrl`, while keeping real Postgres as the explicit path when `postgresUrl` is set.
