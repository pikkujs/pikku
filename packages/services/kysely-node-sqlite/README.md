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

## Docs

https://pikku.dev/docs
