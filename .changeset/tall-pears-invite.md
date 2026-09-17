---
'@pikku/cli': patch
'@pikku/deploy': patch
---

Resolve a standalone build's database the way every other pikku host resolves it.

A standalone artifact opens its own database, and decided it had one by looking
for `db/sqlite` or `db/postgres` on disk. Every other host goes through
`loadUserConfigForDb`: `createConfig`'s `sqliteDb` / `postgresUrl` first, the
directory conventions only as the fallback. An app that declares its database in
config and keeps no migrations therefore got a `kysely` under `pikku dev` and
none in its artifact — a clean build, a plausible 94MB bundle, and a first run
that died on the line of `createSingletonServices` that reads it.

The build now asks the same question in the same order. Only the engine travels:
a configured SQLite path is a developer's local file and has no meaning on the
target host, which still names its own through `PIKKU_DATA_DIR`. Declaring both
dialects is refused by name, matching the existing refusal of two migration
directories, and a `createConfig` that cannot be loaded falls back to the
directories rather than failing a build — a project with no database at all must
still bundle.

Two JSDoc blocks that had drifted off their declarations are reattached:
`EntryGenerationContext['db']`, which was documenting `version`, and
`resolveStandaloneDb`, which was documenting `resolveProjectVersion`.
