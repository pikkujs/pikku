---
'@pikku/cli': patch
---

Let a project declare the Postgres extensions its embedded PGlite databases need

The CLI migrates a PGlite shadow database to type and diff a schema, and PGlite
only has the extensions it was constructed with — pgcrypto, and nothing else.
A migration doing `CREATE EXTENSION vector` therefore failed every `db` command
with `extension "vector" is not available`, whatever the real server had, and
there was no way to say otherwise.

`createConfig` now takes `pgliteExtensions`. A bare name is one of PGlite's
bundled contrib extensions and needs no install; anything else is a package the
project depends on:

```ts
export const createConfig = async () => ({
  postgresUrl: process.env.DATABASE_URL,
  pgliteExtensions: ['@electric-sql/pglite-pgvector', 'hstore'],
})
```

They are loaded into both embedded databases — the local dev one and the shadow
— and resolved from the project before the CLI, so the version the project
installed is the one that runs. Declared for a `postgresUrl` project too: the
shadow is PGlite whichever server the app itself talks to.

An extension that is used but not declared now says so, rather than reporting
Postgres' own message about an unavailable extension with nothing pointing at
the config that would have loaded it.
