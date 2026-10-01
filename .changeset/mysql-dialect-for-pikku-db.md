---
'@pikku/cli': patch
'@pikku/migrator-sql': patch
'@pikku/kysely': patch
'@pikku/skills': patch
---

MySQL is a third dialect for the `pikku db` commands, beside sqlite and postgres.

Set `mysqlUrl` in `createConfig` and `db migrate`, `generate`, `check`, `baseline`, `reset`, `codegen` and the dev seed behave as they do elsewhere, with migrations in `db/mysql/` and the seed in `db/mysql-dev-seed.sql`. MySQL has no embedded engine, so a command that needs a throwaway database creates and drops a `pikku_scratch_<hex>` one on your server — the account needs `CREATE` and `DROP`. DDL is not transactional there, so a migration that fails halfway is replayed from the top. `db.schema` is refused, because a MySQL schema is a database.

`@pikku/migrator-sql` gains `@pikku/migrator-sql/mysql`. The runtime schemas in `@pikku/kysely` now compile for MySQL without changing what sqlite and postgres get: keys are `varchar(255)`, free text is `longtext`, literal text defaults are expressions, and foreign keys are table-level constraints, because MySQL parses an inline `REFERENCES` and silently drops it. A foreign key onto a column another source owns takes that column's full type (`varchar(36)`), not the bare `varchar` the introspector reports.

An addon that ships `db/mysql` migrations needs `db.mysqlUrl` in its `pikku.config.json` for `pikku all` to publish them. The standalone bundle does not support MySQL yet and refuses a MySQL project by name.
