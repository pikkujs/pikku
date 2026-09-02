---
'@pikku/deploy-standalone': patch
'@pikku/deploy': patch
'@pikku/cli': patch
---

Give a standalone artifact the database connection every other provider's runtime hands it.

`createSingletonServices` receives `kysely` from whatever is hosting the app —
`pikku dev` builds one, a Cloudflare deploy binds one — so app code is written
expecting it, and the generated templates throw outright when it is absent. The
standalone provider is its own host and supplied nothing, so a bundle built from
a project with a database started, called the services factory, and died on the
first line of it. The artifact was only ever startable by projects that had no
database at all, which is not the case the provider exists to serve.

The generated entry now opens the database itself and passes `kysely` in.
`EntryGenerationContext` carries a `db` descriptor, and the engine is read from
the migrations directory the project actually wrote — `db/sqlite` or
`db/postgres`, the same two conventions the migrator emits to. Having both is
refused rather than resolved: choosing on directory order would choose which
database the deployed app talks to, and an app running happily against the
wrong but entirely valid schema is invisible until someone reads the data.

For SQLite the adapter emits the dialect its runtime can actually use —
`@pikku/kysely-node-sqlite` for the node bundle, `@pikku/kysely-bun-sqlite` for a
compiled bun binary, which has no `node:sqlite` to reach for. For Postgres it
emits `PikkuKysely` from `@pikku/kysely-postgres`, connected from `DATABASE_URL`,
the same variable every other pikku host reads, so an artifact dropped onto a
machine already running a pikku app needs no new one. An unset `DATABASE_URL`
fails by name rather than as a driver error about an undefined connection
string.

The connection pool is closed on shutdown, in `afterStop` — after the app's own
stop hook and the draining server have both finished with it, since a pool
closed any earlier takes the queries they are still entitled to make down with
it. SQLite needs no counterpart: the process exiting releases the file.

The project's generated coercion map is applied to either engine, so a deployed
app and `pikku dev` agree about which columns are dates and which are booleans.
It is attached when the project generated one and skipped when it did not — the
map is built from `db/annotations.ts` rather than from the dialect, so an app
that annotates no columns is one with nothing to coerce rather than one that
should be handed no database at all.

A SQLite file is located by `PIKKU_DATA_DIR` rather than derived from the bundle's
own path: a deploy that swaps the release directory would otherwise take the
database with it. `PIKKU_DATABASE_FILE` overrides it outright, for when the path
has to match one something else already chose — notably `pikku db migrate`,
which has to open the same file or the app runs against an unmigrated schema.
Neither being set fails with the variable's name rather than as a SQLite error
about a path of `undefined`.
