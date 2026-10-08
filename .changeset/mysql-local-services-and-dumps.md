---
'@pikku/cli': patch
'@pikku/migrator-sql': patch
'@pikku/kysely': patch
---

MySQL fixes found moving a Rails database onto pikku.

- The generated local services (`pikku db baseline`, `pikku dev`, `pikku all`, a local CLI) open MySQL: a `mysql://` `DATABASE_URL` or `mysqlUrl` in the config opens through a Kysely `MysqlDialect` on a `mysql2` pool (declare `mysql2` in the project), with `CamelCasePlugin` and the coercion map like the other dialects. A `mysql://` URL was read as a sqlite file path. `db/mysql` now counts as a project database, and `@pikku/kysely` re-exports `MysqlDialect`.
- MySQL migrations run with `FOREIGN_KEY_CHECKS` off, so a mysqldump whose tables reference ones created later applies as it is.
- `TINYINT(1)` is typed `boolean` and coerced at runtime (mysql2 returns 0/1); an explicit `tsType` in `db/annotations.ts` keeps it a number. `DECIMAL` is read as a number (`decimalNumbers`), as the generated types say. `BIGINT` stays `number`, exact to 2^53, which is mysql2's default.
- `pikku all` no longer throws "db/mysql exists but no mysqlUrl is configured": the server comes from createConfig's `mysqlUrl`, `db.mysqlUrl` or a `mysql://` `DATABASE_URL`, and with none the stub `DB` is written.
- Better Auth schema derivation follows the resolved database rather than the factory's `database.type`, so a factory declaring `type: 'sqlite'` no longer sends SQLite introspection (`pragma index_list`) to a MySQL server. Set `type: 'mysql'` in the factory too, so the runtime matches.
