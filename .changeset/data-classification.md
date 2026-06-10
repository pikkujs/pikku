---
"@pikku/core": patch
"@pikku/cli": patch
"@pikku/inspector": patch
---

Add end-to-end data classification for SQLite and Postgres projects.

**Core (`@pikku/core`):** New `Private<T>` and `Secret<T>` intersection brands, `ClassificationManifest`, `ColumnClassification`, and `AnonymizeStrategy` types exported from `data-classification.ts`.

**CLI (`@pikku/cli`):**
- SQL comment annotations: `-- @public`, `-- @private[:strategy]`, `-- @secret[:strategy]` on `CREATE TABLE` columns and `ALTER TABLE ... ADD COLUMN` statements. Unannotated columns default to `private`.
- `pikku db migrate` now emits a `classification.gen.ts` manifest alongside `schema.d.ts`.
- New `pikku db audit` command — prints a per-column classification summary and warns on `private`/`secret` columns with no anonymize strategy.
- Postgres dialect support in `resolveDb`, `PostgresMigrationExecutor`, and `PostgresIntrospector`.

**Inspector (`@pikku/inspector`):** New PKU910 check — `findPiiPaths()` walks inferred function return types looking for `__pii__` brands (including inside `Array<T>`, `Record<K,V>`, and index signatures) and fails the build if a function exposes branded fields in its output.
