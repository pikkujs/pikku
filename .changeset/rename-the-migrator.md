---
'@pikku/sql-migrator': patch
'@pikku/deploy-standalone': patch
'@pikku/cli': patch
---

Rename `@pikku/db-migrator` to `@pikku/sql-migrator`.

It applies `.sql` files and keeps their bookkeeping; it is not a database
service, and `db-` read as though it were one. Nothing was ever published under
the old name, so there is no alias to keep.
