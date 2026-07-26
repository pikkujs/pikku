---
'@pikku/cli': minor
---

`pikku db check` now tells a table the pikku runtime created apart from one nobody can explain.

`db check` reports tables in the database that no migration creates. Until now every table a `@pikku/kysely` service bootstrapped at boot landed in that bucket, alongside genuine leftovers — which is noise, and the wrong conclusion, because for those the remedy is known.

The runtime's declaration (`pikkuSchemas`, new in `@pikku/kysely`) is now used to recognise them, and they are reported separately with the fix: `pikku db generate` writes them down so the schema stops depending on which services happened to start.

Recognising, not requiring — absence of a runtime table is not a finding. A project that never constructs the workflow or AI services is not missing their tables.

The runtime declaration names Better Auth as a prerequisite, so `db check` applies the project's auth schema into the same scratch database before materializing it. A project that configures no auth is not an error: the schemas that needed it are left out and reported, so an unexplained table is never silently the one that could not be recognised.

Run against a real project this correctly attributed nine tables: four workflow tables in `app`, and five AI tables that a `pikku dev`/`pikku serve` connection had created unqualified in `public`, shadowing the `app` ones its migrations own.

## `db generate` writes down every schema, not just Better Auth's

`db generate` used to know about one source. It now walks a registry — Better Auth, the pikku runtime declaration, then each wired addon — and writes one migration per source, numbered in dependency order so they can be reviewed and applied independently.

Three cases per source, and the difference matters. Fully covered is nothing to do. Nothing covered writes the source's own SQL verbatim, which is the one case where the source knows better than any diff: it carries the indexes, constraints and ordering a table-and-column comparison cannot see. Partially covered writes the delta, because re-emitting a whole schema would fail on the tables that already exist.

The delta is real DDL, not a report. New tables come out as `CREATE TABLE` with a `REVIEW:` note that a column list carries no indexes or foreign keys; new columns come out as `ALTER TABLE … ADD COLUMN`. A column that is `NOT NULL` with no default gets the statement _and_ the problem written above it — it cannot be applied to a table with rows, and what those rows should get is not a generator's decision. Those columns are also listed back to the caller, so the command warns about them by name.

## `pikku db baseline`

Records the pending migrations as applied, without running them. For the database that already contains what they describe — the shape you get when a runtime created its tables at boot and the migration writing them down was authored afterwards. Applying that migration fails on every existing deployment; leaving it pending forever means the history never catches up with reality.

A separate command rather than a `--baseline` flag on `migrate`, deliberately: a flag pasted into a deploy script would silently stop applying migrations forever.

It refuses unless the database really is up to date, since that is the entire premise. A database that is behind gets the report `db check` would have given it, because recording migrations that never ran would bury a real gap under a history claiming everything is applied.

## Addons can ship a schema — `pikku db export`

An addon has no database of its own. It runs inside the consumer, against the consumer's, so it must never create tables at boot and must never name a schema.

`pikku db export` runs in the addon's build and publishes what it needs to `.pikku/db/pikku-db-meta.gen.json` — one more channel beside `.pikku/function` and `.pikku/scopes`, resolved by package name. It materializes the addon's own `db/sqlite` and `db/postgres` migrations into a throwaway database and introspects them, so the artifact answers both "what must exist" and "what creates it" without a second description that drifts. Every dialect the package has migrations for is exported, since an addon is published once and consumed by projects on either engine.

On the other side, `db generate` folds each wired addon's schema into the consumer's own migration history, where the project reviews it like anything else. A `wireRemoteAddon` addon contributes nothing — it runs on another host, against that host's database. An addon that publishes a schema for a dialect the consumer does not use is reported rather than skipped quietly: its services would fail at runtime.

## A project with no migrations directory no longer crashes

`db generate`, `db check` and `db migrate` read the migrations on disk to work out what is already covered, and threw `ENOENT` when there was no `db/<dialect>` directory to read. That is the first run on a new project — the exact case `db generate` exists to serve. A directory that does not exist means no migrations, which is an answer, not a failure.
