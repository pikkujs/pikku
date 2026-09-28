---
'@pikku/cli': minor
---

The embedded PGlite database loads pgvector by default, so `CREATE EXTENSION vector` works in `pikku dev` and every `db` command without declaring `@electric-sql/pglite-pgvector` in `db.pgliteExtensions`. The CLI pins `@electric-sql/pglite` and `@electric-sql/pglite-pgvector` to the exact pair pgvector was built for, so they can no longer drift apart. A project that still declares its own copy keeps using that one.
