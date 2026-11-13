---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/cli': patch
---

The 17 framework schemas in `@pikku/kysely` are now plain table declarations compiled by `compileTables`, and their SQL is unchanged on sqlite, postgres and MySQL. `PikkuSchema` carries `tables` (plus `extraStatements` for DDL a declaration cannot express) instead of `statements`, and its `requires` are inferred from the declaration. In `@pikku/core/db`, a table's `primaryKey` and `unique` entries can name the constraint (`{ name, columns }`), and a string default on any text-like column compiles as an expression on MySQL.
