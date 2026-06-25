---
'@pikku/cli': patch
---

db codegen: type SQLite `CHECK (col IN ('a','b',…))` columns as string-literal
unions, and emit a standalone bare-enums module for both dialects.

SQLite has no native enums, but a column-level `CHECK … IN (…)` constraint is an
enum by another name — the introspector now parses it from the table DDL and the
generated Kysely schema types the column as `'a' | 'b' | …` instead of `string`
(mirroring how Postgres enum columns are typed). Only the positive `col IN (…)`
form is recognised; `NOT IN`, ranges, and boolean expressions stay `string`.

Also emits `.pikku/db/enums.gen.ts` — bare `export type <Table><Column>` unions
for every enum column (Postgres native enums and SQLite CHECK alike), independent
of the wrapped `ColumnType<Private<…>>` DB interface. Callers (and i18n catalog
reconciliation) can import a clean union without unwrapping.
