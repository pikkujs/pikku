# @pikku/kysely-node-sqlite

Kysely driver for Pikku backed by Node's built-in `node:sqlite` module — no
native dependency to install or compile.

Ships a coercion plugin that maps SQLite's storage classes back to the types
your schema declares (booleans, dates, JSON).

## Install

```bash
npm install @pikku/kysely-node-sqlite
```

Requires a Node version with `node:sqlite` available.

## Usage

```typescript
import { createNodeSqliteKysely } from '@pikku/kysely-node-sqlite'
import type { KyselyPikkuDB } from '@pikku/kysely'

const db = createNodeSqliteKysely<KyselyPikkuDB>({
  filename: 'app.db',
})
```

`camelCase` (default `true`) applies Kysely's `CamelCasePlugin`; pass extra
`plugins` to layer more on top. Use `':memory:'` for an in-memory database.

## User-defined SQL functions

`node:sqlite` can register scalar functions, so SQL can call your own code:

```typescript
const db = createNodeSqliteKysely<KyselyPikkuDB>({
  filename: 'app.db',
  functions: {
    similarity: (a, b) => trigramSimilarity(String(a), String(b)),
  },
})
```

They are registered as **deterministic**, which is what allows SQLite to use
them in an index and to cache repeated calls. Do not register a function whose
result depends on the clock, a random source, or anything mutable.

If you build the connection yourself — as you must when you need pragmas like
WAL or `busy_timeout` — call `registerSqliteFunctions(db, { … })` on it directly.

**This option has no bun equivalent.** `bun:sqlite` cannot register functions at
all, so `@pikku/kysely-bun-sqlite` throws `SqliteFunctionsUnsupportedError`
rather than accepting them. Using this is a decision to stay on Node; if you may
want to move, do the computation outside SQL over an indexed candidate set
instead.

## Docs

https://pikku.dev/docs
