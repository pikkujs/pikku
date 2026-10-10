---
'@pikku/kysely': patch
'@pikku/cli': patch
---

MySQL: the `@pikku/kysely` stores no longer emit postgres/sqlite-only SQL. Upserts use `on duplicate key update`, insert-or-ignore uses `insert ignore`, `returning` deletes read the rows first, the lease clock casts to `signed`, workflow JSON state uses `CAST(... AS JSON)`, the agent thread owner `LIKE` escapes with `!`, and timestamp columns are written as `Date`s instead of `Z`-suffixed ISO strings. `pikku db generate` now emits the `scope` schema when Better Auth's user model is a mapped table (for example a Rails `users` table), typing the key column from the real `users.id`.
