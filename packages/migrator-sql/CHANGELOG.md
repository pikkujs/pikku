# @pikku/migrator-sql

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
