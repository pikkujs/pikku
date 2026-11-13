---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/kysely': patch
'@pikku/addon-console': patch
---

Column constraints in `db/tables.ts` are real. `enum`, `min`, `max`, `minLength` and `maxLength` become named inline `CHECK`s on new tables and new columns, `pattern` and the bounds reach the generated zod schema, and the introspectors read checks back on postgres, sqlite and MySQL. Adding or changing a constraint on an existing column is refused with the check's name until a migration is written by hand. `pikku meta db` and the console schema show each column's constraints.
