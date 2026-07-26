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

## Docs

https://pikku.dev/docs
