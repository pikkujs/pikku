# @pikku/sql-migrator

## 0.12.2

### Patch Changes

- f970f8f: Rename `@pikku/db-migrator` to `@pikku/sql-migrator`.

  It applies `.sql` files and keeps their bookkeeping; it is not a database
  service, and `db-` read as though it were one. Nothing was ever published under
  the old name, so there is no alias to keep.

## 0.12.1

### Patch Changes

- a057bec: Extract the SQL migration applier into `@pikku/sql-migrator`, so the CLI is no longer the only thing that can run one.

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
