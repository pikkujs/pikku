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
`EntryGenerationContext` carries a `db` descriptor, populated for projects with
SQLite migrations and a generated coercion map, and the adapter emits the
dialect its runtime can actually use — `@pikku/kysely-node-sqlite` for the node
bundle, `@pikku/kysely-bun-sqlite` for a compiled bun binary, which has no
`node:sqlite` to reach for. The project's generated coercion map is applied, so a
deployed app and `pikku dev` agree about which columns are dates and which are
booleans.

The file is located by `PIKKU_DATA_DIR` rather than derived from the bundle's
own path: a deploy that swaps the release directory would otherwise take the
database with it. `PIKKU_DATABASE_FILE` overrides it outright, for when the path
has to match one something else already chose — notably `pikku db migrate`,
which has to open the same file or the app runs against an unmigrated schema.
Neither being set fails with the variable's name rather than as a SQLite error
about a path of `undefined`.

Postgres is not wired: it self-hosts against a server the build cannot assume
anything about, and needs a URL rather than a path.
