---
'@pikku/cli': patch
---

`pikku db reset` empties a SQLite database in place instead of deleting the file, so a running `pikku dev` keeps a writable database rather than failing with SQLITE_READONLY_DBMOVED. New `pikku db annotate` writes a `kind` into `db/annotations.ts` for each SQLite column declared BOOLEAN, DATE/DATETIME/TIMESTAMP or JSON, leaving hand-written entries alone.
