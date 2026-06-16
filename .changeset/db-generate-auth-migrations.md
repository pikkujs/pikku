---
"@pikku/cli": patch
---

feat(cli): `pikku db generate` + Better Auth drift guard in `pikku db migrate`

The Better Auth schema is owned by `pikkuBetterAuth`, not hand-written, so the
committed SQL migrations can silently fall behind the auth config (a stale
migration deploys a half-applied auth schema and `signUp` 500s at runtime).

`pikku db generate` asks Better Auth for its required schema and, when the
existing migrations don't yet cover it, writes a forward SQL migration. The
schema is materialised by running Better Auth's own `runMigrations()` through the
project's CamelCasePlugin kysely (so columns are snake_case), then drift is
detected by introspection set-diff — never via `getMigrations`' field-level diff
arrays, which compare its camelCase field keys against snake_case columns and so
always report false drift.

`pikku db migrate` now runs the same check after applying migrations and fails
loudly ("run `pikku db generate`") if the applied schema doesn't satisfy what
Better Auth requires, rather than letting the drift reach runtime.

Generation is SQLite-only for now (table/column names are dialect-independent, so
the drift *check* works for postgres too; postgres migration emission is not yet
automated). Incremental changes on top of an already-migrated auth schema are
reported with the delta for a hand-written forward migration rather than emitting
a full re-CREATE.
