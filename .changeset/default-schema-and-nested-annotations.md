---
'@pikku/cli': patch
'@pikku/inspector': patch
---

Read schema-qualified annotations, and let a project name its default schema.

`DbClassificationMap` nests tables under their schema whenever a project sets
`db.schema`, but `loadAnnotations` read the sidecar as a flat table→column map.
It therefore took the schema for a table and each table for a column, found no
recognised fields, and dropped every annotation on the floor — so a project
could mark a column `secret` and watch it generate as `private`, with no error
anywhere. The parser now detects the extra level (a column entry's values are
primitives; a table's are objects) and flattens it, so both shapes load.

New `db.defaultSchema` drops one schema's qualifier from the generated types:
with `defaultSchema: 'app'`, `app.user` is queried as `selectFrom('user')` and
typed as `User` rather than `AppUser`, matching what a project whose
`search_path` already resolves the schema actually writes. Tables in other
schemas stay qualified. Where dropping the qualifier would make two tables
share a name, the table keeps its qualifier and the codegen warns (PKU485)
rather than letting one silently shadow the other — queries against the loser
would have typechecked against the wrong columns.

The generated key is what Kysely puts in the SQL, so this is opt-in and
separate from `db.schema`: setting it for a schema the connection does not
resolve gives you queries that compile and then fail to find their table.
