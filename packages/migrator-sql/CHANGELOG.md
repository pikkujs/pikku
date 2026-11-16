# @pikku/migrator-sql

## 0.12.12

### Patch Changes

- 353bc05: Column constraints in `db/tables.ts` are real. `enum`, `min`, `max`, `minLength` and `maxLength` always reach the generated zod schema, the generated union types and `pikku meta db` / the console schema, and `pattern` reaches zod only. On Postgres and MySQL they also become named inline `CHECK`s on new tables, new columns and existing columns, and the introspectors read checks back on postgres, sqlite and MySQL. Check names are `<table>_<column>_<hash>_<kind>_check`, the hash being of the table and column pair so two tables never collide (MySQL keeps check names schema-wide); a name too long for the engine has its readable front cut and keeps the hash and the ending. The scheme is unreleased, so no deployed names change. MySQL checks are read back as a real MySQL 8.4 stores them (introducers, escapes), a `NOT ENFORCED` check is read as not enforcing, and MariaDB is refused before anything runs against it.

  SQLite gets no generated `CHECK`: it cannot change one without rebuilding the table, so the constraints there are validation only. `pikku db generate` and `pikku db check` print one notice listing each declared constraint with the `CHECK` to add in a hand-written migration, suppressible with `validate.rules["db-sqlite-unenforced-constraints"] = "off"`. A `CHECK` written by hand in a sqlite migration is left alone and still types the column, and the notice leaves out any constraint such a check already enforces.

  Adding, changing or removing a constraint on an existing Postgres or MySQL column is written instead of refused: `ADD`/`DROP CONSTRAINT` on postgres and `ADD CONSTRAINT`/`DROP CHECK` on MySQL 8.0.16+ (older servers, MariaDB and Aurora 2.x are refused up front; Aurora 3.x is accepted), each added check carrying a `-- pikku:check-probe` line that `migrate` runs against the live rows first, through `checkProbeHook` (the MySQL probe is bounded by `max_execution_time`). `migrate` now refuses a pending migration marked `-- pikku:destructive` unless `allowDestructive` is given (`pikku db migrate --allowDestructive`, the standalone bundle's `db migrate --allow-destructive`); `pikku ci` passes it only when its worktree's database is its own (a SQLite file or embedded Postgres inside the worktree) or when `pikku ci --allowDestructive` says so; a worktree that points at a local server does not get it. A generated check the declaration no longer wants is recognised by its name shape (`<...>_<8hex>_<kind>_check`) and dropped even after a hand rename of its table or column, and `db check` reports it as stale; check names are cut by code point to fit the engine. The probe scan also detects `REPLACE`, `CALL`, `COPY ... FROM`, `DO` blocks and `EXPLAIN ANALYZE` of a data change. On bun, `exec` now runs each sqlite statement on its own with a sqlite-specific splitter, because bun:sqlite drops a statement's error whenever anything follows it, which let a failed migration be recorded as applied.

  A declared constraint is enforced at runtime only where a function uses the generated zod (`<Table>InsertZ`, `PatchZ`, `Z`) as its `input`; a Kysely write that skips such a function is guarded only by the DB `CHECK`s on Postgres and MySQL, and on SQLite not at all. Whole-number columns (`integer`, `bigint`, `smallint`, `serial`) are now generated as `z.number().int()`. When a declared `enum` differs from the enum the database holds, the generated union follows the declaration and codegen warns once per column (`PKU488`; on SQLite the advice is to add the `CHECK` by hand, since generate writes none there). A declaration that has both an `enum` and a `pattern`, or a numeric or text `default` its own min/max/length bounds reject, is refused when the file loads; this replaces the database silently winning.

## 0.12.11

### Patch Changes

- 8b261d4: An app can declare its tables and their annotations in `db/tables.ts` with `defineTables`, and `pikku db generate` writes the SQL. It adds new tables, columns and indexes, adopts tables the migrations already create, and refuses a drop, a rename or a changed column with the reason, writing nothing. `pikku db migrate` and `pikku db check` stop when the declaration is ahead of the migrations. New `pikku meta db`, and a `db` block in `pikku meta context`, say where tables are declared. Opt-in by the presence of the file; an app with hand-written migrations is unchanged. See docs/db-tables.md and docs/MIGRATION.md.

## 0.12.10

### Patch Changes

- a28fefd: The migrator no longer treats dotfiles as migrations. A tarball packed on macOS carries a binary AppleDouble `._<name>.sql` beside every migration; extracted on Linux it sorted first and was run as SQL, failing `migrate` under Bun's sqlite and being recorded as an applied migration under `node:sqlite`. A migration the database refuses now throws `MigrationFailedError` (`[PKU-DB-MIGRATE]`), which names the file and keeps the driver's error as `cause`.

## 0.12.9

### Patch Changes

- 674af8a: Bump every external dependency to its latest minor or patch release.
- 135811c: Move @types/node to 26.
- 19895c4: Every publishable package now ships only what it needs,, as `@pikku/core` does:

  - A `files` allow-list: `dist` (and `@pikku/aws-services`' `scripts`), plus the `README.md`, `LICENSE` and `package.json` npm always includes. Tarballs no longer carry `knowledge/`, `run-tests.sh`, test fixtures, stray `src/` files, the CHANGELOG or `tsconfig.tsbuildinfo`.
  - `build` deletes `dist/` and `tsconfig.tsbuildinfo` first (`bun run clean`), so a local publish can no longer ship modules whose sources were deleted.
  - `./package.json` is exported, so `import pkg from '@pikku/<name>/package.json'` resolves under an `exports` map.

## 0.12.8

### Patch Changes

- 51ec3ac: MySQL fixes found moving a Rails database onto pikku.

  - The generated local services (`pikku db baseline`, `pikku dev`, `pikku all`, a local CLI) open MySQL: a `mysql://` `DATABASE_URL` or `mysqlUrl` in the config opens through a Kysely `MysqlDialect` on a `mysql2` pool (declare `mysql2` in the project), with `CamelCasePlugin` and the coercion map like the other dialects. A `mysql://` URL was read as a sqlite file path. `db/mysql` now counts as a project database, and `@pikku/kysely` re-exports `MysqlDialect`.
  - MySQL migrations run with `FOREIGN_KEY_CHECKS` off, so a mysqldump whose tables reference ones created later applies as it is.
  - `TINYINT(1)` is typed `boolean` and coerced at runtime (mysql2 returns 0/1); an explicit `tsType` in `db/annotations.ts` keeps it a number. `DECIMAL` is read as a number (`decimalNumbers`), as the generated types say. `BIGINT` stays `number`, exact to 2^53, which is mysql2's default.
  - `pikku all` no longer throws "db/mysql exists but no mysqlUrl is configured": the server comes from createConfig's `mysqlUrl`, `db.mysqlUrl` or a `mysql://` `DATABASE_URL`, and with none the stub `DB` is written.
  - Better Auth schema derivation follows the resolved database rather than the factory's `database.type`, so a factory declaring `type: 'sqlite'` no longer sends SQLite introspection (`pragma index_list`) to a MySQL server. Set `type: 'mysql'` in the factory too, so the runtime matches.

## 0.12.7

### Patch Changes

- 80c94f9: MySQL is a third dialect for the `pikku db` commands, beside sqlite and postgres.

  Set `mysqlUrl` in `createConfig` and `db migrate`, `generate`, `check`, `baseline`, `reset`, `codegen` and the dev seed behave as they do elsewhere, with migrations in `db/mysql/` and the seed in `db/mysql-dev-seed.sql`. MySQL has no embedded engine, so a command that needs a throwaway database creates and drops a `pikku_scratch_<hex>` one on your server — the account needs `CREATE` and `DROP`. DDL is not transactional there, so a migration that fails halfway is replayed from the top. `db.schema` is refused, because a MySQL schema is a database.

  `@pikku/migrator-sql` gains `@pikku/migrator-sql/mysql`. The runtime schemas in `@pikku/kysely` now compile for MySQL without changing what sqlite and postgres get: keys are `varchar(255)`, free text is `longtext`, literal text defaults are expressions, and foreign keys are table-level constraints, because MySQL parses an inline `REFERENCES` and silently drops it. A foreign key onto a column another source owns takes that column's full type (`varchar(36)`), not the bare `varchar` the introspector reports.

  An addon that ships `db/mysql` migrations needs `db.mysqlUrl` in its `pikku.config.json` for `pikku all` to publish them. The standalone bundle does not support MySQL yet and refuses a MySQL project by name.

## 0.12.6

### Patch Changes

- 1fe79bc: `SqliteRuntime.open` takes an `extensions` option: absolute paths of loadable SQLite extensions to load into the connection. On bun, `exec` now fails with `no such module: <name>` for a `CREATE VIRTUAL TABLE` over a module that is not loaded; bun:sqlite drops that error whenever anything follows the statement, which let such a migration be recorded as applied without its table.

## 0.12.5

### Patch Changes

- 4c7a1b5: Run the monorepo's own scripts through bun instead of yarn. What moves is the
  package manager each package's `prepublishOnly` and build scripts invoke, plus
  the two manifest fixes bun needs to resolve the tree: `uWebSockets.js` is
  declared with an explicit `github:` specifier, and `@pikku/uws-handler` marks
  its `uWebSockets.js` peer optional so a bun install of a consumer that brings
  its own uWS app does not try to fetch it from the registry.

  Three published behaviours change, all of them cases where an isolated
  `node_modules` or bun as the runtime had been papered over by yarn's hoisting:

  - `@pikku/migrator-sql` turns foreign keys on when it opens a sqlite database
    through bun. `node:sqlite` enforces them by default and `bun:sqlite` does not,
    which silently turned every `ON DELETE CASCADE` into a no-op under
    `bunx --bun pikku`.
  - `@pikku/cli` resolves a deploy provider against the project being deployed
    rather than against wherever the CLI itself is installed, which is what its
    own "is not installed" error asks the user to arrange.
  - `@pikku/cli` treats a specifier a runtime hands straight back — bun does this
    for the modules it implements itself — as not resolved from the project, so
    it falls back rather than loading the runtime's own copy.

## 0.12.4

### Patch Changes

- 7262b4c: `db generate` now creates a referenced table before the one referencing it

## 0.12.3

### Patch Changes

- b2e038b: Rename `@pikku/sql-migrator` to `@pikku/migrator-sql`, so a future migrator for
  another store sorts beside it rather than under a second prefix. The package has
  never been published under either name, so nothing depends on the old one.

## 0.12.2

### Patch Changes

- f970f8f: Rename `@pikku/db-migrator` to `@pikku/migrator-sql`.

  It applies `.sql` files and keeps their bookkeeping; it is not a database
  service, and `db-` read as though it were one. Nothing was ever published under
  the old name, so there is no alias to keep.

## 0.12.1

### Patch Changes

- a057bec: Extract the SQL migration applier into `@pikku/migrator-sql`, so the CLI is no longer the only thing that can run one.

  A shipped standalone bundle has to apply the same migrations to the same database as `pikku db migrate`, from a machine with no checkout. That only works if both agree on the bookkeeping table, the file hash and the file order — a second implementation that differs in any of the three reads every migration the other applied as drifted and refuses to go on.

  Nothing about the CLI's behaviour changes; the algorithm, the `sql_migrations` table and the drift error moved intact.

- a057bec: Give a standalone bundle a command line.

  An operator holding a standalone artifact on a machine had one thing they could
  do with it: start it. Applying the migrations it needs meant a checkout of the
  project and a second copy of the CLI on a production box, and answering "which
  build is this" meant asking whoever ran the deploy.

  The bundle now takes a command. `serve` remains the default, so an existing
  `node bundle.js` is unchanged. `version` prints the version the project declared
  at build time. `db migrate` and `db status` apply and report the migrations that
  now ship beside the bundle under `db/<engine>/` — the same path Fabric's build
  container stages them to, so the two producers of an artifact cannot disagree
  about where the SQL lives. `backup <path>` writes a consistent copy of a SQLite
  database with `VACUUM INTO`; on postgres it refuses and names `pg_dump`, which
  is the tool for it.

  Both engines are supported: a postgres build migrates over the connection it
  already opens. `PostgresMigrationClient` grew an optional `begin`, because a
  pooled client is free to answer `BEGIN`, the migration and `COMMIT` on three
  different connections — which leaves a failed migration half applied with
  nothing to roll back.

  There is deliberately no way to invoke an RPC. A running server already answers
  them with auth, sessions and middleware applied; an in-process invoke would
  answer them with none of that.
