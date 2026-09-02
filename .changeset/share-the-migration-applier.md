---
'@pikku/db-migrator': patch
'@pikku/cli': patch
---

Extract the SQL migration applier into `@pikku/db-migrator`, so the CLI is no longer the only thing that can run one.

A shipped standalone bundle has to apply the same migrations to the same database as `pikku db migrate`, from a machine with no checkout. That only works if both agree on the bookkeeping table, the file hash and the file order — a second implementation that differs in any of the three reads every migration the other applied as drifted and refuses to go on.

Nothing about the CLI's behaviour changes; the algorithm, the `sql_migrations` table and the drift error moved intact.
