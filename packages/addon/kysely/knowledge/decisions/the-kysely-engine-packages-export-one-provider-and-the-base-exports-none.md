---
type: decision
title: Each kysely engine package exports one provider, and the base exports none
description: A project wires one engine addon for its database; it has dev and deploy:cloudflare-* variants and no deploy:standalone variant, and it reads its connection from a declared secret or variable
tags: [kysely, provider, addon]
---

# Each kysely engine package exports one provider, and the base exports none

`@pikku/addon-kysely-postgres`, `-mysql`, `-sqlite`, `-bun-sqlite` and
`-node-sqlite` each export a `kysely` provider; `@pikku/addon-kysely` is the shared
base and exports none. A project wires one of them with
`wireAddon({ name: 'db', package, providers: ['kysely'] })`, and a unit that
reaches no `kysely` does not bundle the driver (the verifier greps real bundles of
the postgres and libSQL providers, one at a time).

Variants follow where the driver can run: postgres and mysql have `dev` and
`deploy:cloudflare-container`; libSQL has `dev`, `deploy:cloudflare-worker` and
`deploy:cloudflare-container`; the bun and node SQLite providers are `dev` only.
None has `deploy:standalone`, because the standalone entry opens its own database
(PKU397). A project that wires an engine addon has no `db` section, or `pikku dev`
owns `kysely` too.

The connection comes from the addon's declared names, since an addon provider
reads only what it declares: `DATABASE_URL` (secret) for postgres and mysql,
`LIBSQL_URL` (secret) and `LIBSQL_AUTH_TOKEN` (optional secret) for libSQL,
`SQLITE_PATH` (optional variable, default `:memory:`) for the file engines.
