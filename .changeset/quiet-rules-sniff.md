---
'@pikku/cli': patch
---

Add `pikku db codegen` — regenerate the database types from the migration files without connecting to a database.

`pikku db migrate` can only emit types after migrating the configured database, which forces codegen to run late: on a deploy that means the schema has already moved by the time anything is generated, so a build step that needs the table zod (a function schema built from `#pikku/db/zod.gen.js`) cannot run before it. `db codegen` applies the same migrations to a throwaway database — `:memory:` for SQLite, embedded PGlite for Postgres — and introspects that, so `pikku all` can be handed an accurate schema on a machine with no database reachable.

The generated types describe what the migrations define, which is the contract. Introspecting a live database additionally picks up whatever has drifted into it — tables a runtime bootstrapped at boot, leftovers from a reverted branch — so the two can differ; that difference is the point.
