---
'@pikku/kysely-sqlite': patch
'@pikku/cloudflare': patch
'@pikku/cli': patch
---

Let the SQLite and D1 Kysely factories take extra plugins, and stop the fabric
coercion check from missing a bool-only map.

`createNodeSqliteKysely` and `createBunSqliteKysely` both accept a `plugins`
array, which is how the generated `coercionMap` reaches a Kysely instance.
`createSQLiteKysely` and `createD1Kysely` did not: they hard-coded their plugin
array, so the one instance a deployed Cloudflare Worker builds had no way to
apply the coercion the CLI generates. They now take an options object with
`plugins`, layered ahead of `SerializePlugin`, which has to stay last, and
`@pikku/kysely-sqlite` re-exports `createCoercionPlugin` and `CoercionMap` the
way `@pikku/kysely-node-sqlite` already did, so a worker that only depends on
the SQLite package can build the plugin.

The fabric `coercion-map-not-wired` check tested the generated file for
`"date" | "boolean" | "json"`, but the codegen emits `bool`, never `boolean`. A
project whose only annotated columns were booleans passed the check with the map
unwired — exactly the case that is invisible locally, since the dev driver
returns `true` where a deployed stage returns `1`.
