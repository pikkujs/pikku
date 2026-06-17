---
'@pikku/cli': patch
---

Fix `INSERT ... RETURNING` statements being treated as write queries on Node.js 22+

`node:sqlite`'s `StatementSync` has no `.reader` property (unlike `better-sqlite3`).
The fallback SQL inspection only checked for `SELECT`, `WITH`, `PRAGMA`, `EXPLAIN`,
and `VALUES` prefixes, so `INSERT ... RETURNING *` was incorrectly classified as a
write query. Kysely then called `stmt.run()` (which discards rows) instead of
`stmt.all()`, causing `INSERT ... RETURNING` to return no data — breaking
`better-auth` user creation and any other query that relies on `RETURNING`.

Fix: add `|| /\bRETURNING\b/.test(upper)` to the reader-detection heuristic so any
statement containing a `RETURNING` clause is correctly dispatched to `stmt.all()`.
