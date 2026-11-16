---
'@pikku/cli': patch
'@pikku/migrator-sql': patch
---

Internal cleanup: the SQL statement splitter, comment stripper, SQLite splitter and check probe share one comment and quote scan instead of each carrying a copy, and an unused helper is removed. The five copies of the snake_case conversion are one, which fixes one behaviour: the SQLite constraint notice now names the real column for a name with consecutive capitals (`statusHTTPCode` is `status_httpcode`, as every other command already has it, not `status_http_code`).
