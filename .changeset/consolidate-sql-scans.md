---
'@pikku/cli': patch
'@pikku/migrator-sql': patch
---

Internal cleanup: the SQL statement splitter, comment stripper, SQLite splitter and check probe share one comment and quote scan instead of each carrying a copy, and an unused helper is removed. No behaviour change.
