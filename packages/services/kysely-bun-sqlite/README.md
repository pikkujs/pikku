# @pikku/kysely-bun-sqlite

Kysely driver for Pikku backed by Bun's built-in `bun:sqlite` module — no
native dependency to install or compile.

Ships a coercion plugin that maps SQLite's storage classes back to the types
your schema declares (booleans, dates, JSON).

## Install

```bash
bun add @pikku/kysely-bun-sqlite
```

Bun only — for Node use `@pikku/kysely-node-sqlite`.

## Usage

```typescript
import { createBunSqliteKysely } from '@pikku/kysely-bun-sqlite'
import type { KyselyPikkuDB } from '@pikku/kysely'

const db = createBunSqliteKysely<KyselyPikkuDB>({
  filename: 'app.db',
})
```

`camelCase` (default `true`) applies Kysely's `CamelCasePlugin`; pass extra
`plugins` to layer more on top. Use `':memory:'` for an in-memory database.

## User-defined SQL functions are not supported

`bun:sqlite` has no equivalent of `node:sqlite`'s `db.function()`, so scalar
UDFs cannot be registered on this driver. Passing `functions` — or calling
`registerSqliteFunctions` — throws `SqliteFunctionsUnsupportedError` immediately,
naming every function requested.

That is deliberate. The alternative is code that registers its functions on Node
and silently does not on bun, where the difference only appears as
`no such function: …` from whichever query calls one.

If you hit this, either run on Node with `@pikku/kysely-node-sqlite`, or move the
computation out of SQL: precompute what the function was matching on into an
indexed table, use that index to narrow to a candidate set, and run the real
logic over those rows in TypeScript.

## Docs

https://pikku.dev/docs
