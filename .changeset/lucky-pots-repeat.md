---
'@pikku/migrator-sql': patch
'@pikku/deploy-standalone': patch
'@pikku/cli': patch
---

Rename `@pikku/sql-migrator` to `@pikku/migrator-sql`, so a future migrator for
another store sorts beside it rather than under a second prefix. The package has
never been published under either name, so nothing depends on the old one.
