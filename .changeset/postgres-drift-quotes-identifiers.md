---
'@pikku/cli': patch
---

`pikku db generate` now quotes the table and column names in the `ALTER TABLE … ADD COLUMN` drift migrations and the fallback `CREATE TABLE` it writes for Postgres. `ALTER TABLE user ADD COLUMN actor …` was a syntax error, because `user` is reserved. SQLite output is unchanged.
