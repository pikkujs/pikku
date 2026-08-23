---
name: pikku-kysely
description: >-
  Use when WRITING KYSELY QUERIES (select/join/aggregate/insert/update/delete) inside a Pikku
  function body, or when setting up SQL database services with Kysely. Covers the query builder
  API (joins, aggregates + groupBy/having, returning, sql template, expression builder, $if,
  transactions, jsonArrayFrom relation helpers) AND @pikku/kysely service setup (channel stores,
  workflow services, secret services, AI storage, deployment services). TRIGGER when: writing any
  non-trivial kysely query (a join, an aggregate/count/sum, groupBy, subquery, transaction, or
  conditional query), the injected `kysely` service is used in a function body, or code uses
  PikkuKysely, KyselyChannelStore, KyselyWorkflowService, KyselySecretService, or the user asks
  about SQL setup with Pikku. DO NOT TRIGGER when: user asks about MongoDB (use pikku-mongodb) or
  Redis (use pikku-redis).
---

# Pikku Kysely (SQL Database Services)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

## Writing Queries — the Kysely query builder

In a Pikku function body the injected `kysely` IS the `Kysely<DB>` instance — query it directly. Every connection factory below wires the **CamelCasePlugin** by default, so you write **camelCase everywhere in TS** (columns, aliases) and raw **snake_case ONLY inside a ` sql` `` literal**. If a project opted out (`createNodeSqliteKysely({ camelCase: false })`), that inverts — check how the instance was built before assuming. Kysely is a query builder, NOT an ORM — there are no relations; shape nested data with the JSON helpers below. Never hand-roll SQL strings; never annotate the return type (in Pikku the output zod schema IS the type).

```typescript
import { sql } from 'kysely'
// Relation helpers are ENGINE-SPECIFIC — import the matching path:
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/sqlite' // SQLite / libSQL
// import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres' // Postgres
```

```typescript
// SELECT + where/orderBy/limit/offset. Terminals: .execute() | .executeTakeFirst()
// | .executeTakeFirstOrThrow(() => new NotFoundError()) — pass an error factory.
const rows = await kysely
  .selectFrom('item')
  .select(['id', 'name', 'quantity'])
  .where('warehouseId', '=', warehouseId)
  .orderBy('name')
  .limit(50)
  .execute()

// JOINS + aliased selects (qualify columns once a join exists)
await kysely
  .selectFrom('stock')
  .innerJoin('item', 'item.id', 'stock.itemId')
  .leftJoin('bin as b', 'b.id', 'stock.binId')
  .select(['stock.id', 'item.name as itemName', 'b.code as binCode'])
  .execute()

// AGGREGATES via the fn helper + groupBy/having. eb.fn.count returns string|number —
// cast if you need a JS number (SQLite: CAST(... AS INTEGER)).
await kysely
  .selectFrom('stock')
  .select((eb) => ['itemId', eb.fn.sum<number>('quantity').as('onHand')])
  .groupBy('itemId')
  .having((eb) => eb.fn.sum('quantity'), '<', 10) // low-stock
  .execute()

// INSERT + RETURNING (one round-trip; works on SQLite & Postgres)
const created = await kysely
  .insertInto('item')
  .values({ name: input.name, warehouseId })
  .returning(['id', 'name'])
  .executeTakeFirstOrThrow()

// UPDATE + RETURNING, DELETE
await kysely
  .updateTable('item')
  .set({ quantity: input.quantity })
  .where('id', '=', input.id)
  .returning(['id', 'quantity'])
  .executeTakeFirstOrThrow()
await kysely.deleteFrom('item').where('id', '=', input.id).execute()

// EXPRESSION BUILDER for and/or; $if for conditional building; sql for raw fragments
await kysely
  .selectFrom('item')
  .selectAll()
  .where((eb) => eb.or([eb('quantity', '=', 0), eb('discontinued', '=', true)]))
  .$if(!!input.search, (qb) => qb.where('name', 'like', `%${input.search}%`))
  .select(sql<number>`quantity * unit_cost`.as('value')) // snake_case ok inside sql``
  .execute()

// NESTED DATA (no relations) — jsonObjectFrom (one) / jsonArrayFrom (many)
await kysely
  .selectFrom('warehouse')
  .select((eb) => [
    'warehouse.id',
    'warehouse.name',
    jsonArrayFrom(
      eb
        .selectFrom('bin')
        .select(['bin.id', 'bin.code'])
        .whereRef('bin.warehouseId', '=', 'warehouse.id')
    ).as('bins'),
  ])
  .execute()

// TRANSACTION — multi-write atomicity. Use trx (not kysely) inside.
await kysely.transaction().execute(async (trx) => {
  await trx
    .updateTable('stock')
    .set({ quantity: 0 })
    .where('itemId', '=', id)
    .execute()
  await trx
    .insertInto('stockMove')
    .values({ itemId: id, delta: -qty })
    .execute()
})
```

Pikku provides SQL database services through six packages:

- `@pikku/kysely` — Base service implementations (database-agnostic), the serialize plugins, `createAuditedKysely` and the `pikkuSchemas` helpers
- `@pikku/kysely-postgres` — PostgreSQL-specific implementations + the `PikkuKysely` connection wrapper and `PgEventHubService` (LISTEN/NOTIFY-backed)
- `@pikku/kysely-mysql` — MySQL-specific implementations
- `@pikku/kysely-sqlite` — SQLite-specific implementations, `createSQLiteKysely`, and the `LibsqlWebDialect`
- `@pikku/kysely-node-sqlite` — `createNodeSqliteKysely` over `node:sqlite`, plus user-defined SQL functions and the coercion plugin
- `@pikku/kysely-bun-sqlite` — the same over `bun:sqlite`

The last two are runtime adapters rather than service sets: they build the
`Kysely<DB>` you inject into functions, while the dialect packages above supply
Pikku's own stores. They differ in one place — `bun:sqlite` cannot register
scalar functions, so `createBunSqliteKysely` throws if you pass `functions`.

All implement standard Pikku interfaces from `@pikku/core`.

## Installation

```bash
# Pick your database
yarn add @pikku/kysely @pikku/kysely-postgres     # PostgreSQL
yarn add @pikku/kysely @pikku/kysely-mysql        # MySQL
yarn add @pikku/kysely @pikku/kysely-sqlite       # SQLite (stores)
yarn add @pikku/kysely-node-sqlite                # SQLite on Node
yarn add @pikku/kysely-bun-sqlite                 # SQLite on Bun
```

## API Reference

### PostgreSQL Connection — `PikkuKysely`

```typescript
import { PikkuKysely } from '@pikku/kysely-postgres'

const db = new PikkuKysely<DB>(
  logger: Logger,
  connectionOrConfig: postgres.Sql | postgres.Options | string,
  defaultSchemaName?: string,
  poolConfig?: PostgresConfig   // maxPool, connectTimeout, idleTimeout, maxLifetime, prepare, statementTimeout
)

await db.init()
db.kysely  // Kysely<DB> instance for queries
await db.close()
```

It builds a postgres.js-backed Kysely with the CamelCasePlugin. Pass an existing
`postgres.Sql` when something else owns the pool — the wrapper then leaves it
open on `close()`. `poolConfig` keys are only forwarded when set, so postgres.js
keeps its own defaults for the rest, and it is ignored entirely when you hand in
an already-constructed connection.

### SQLite factories

```typescript
import { createNodeSqliteKysely } from '@pikku/kysely-node-sqlite'

// Your application DB — CamelCasePlugin on by default
const kysely = createNodeSqliteKysely<DB>({
  filename: 'app.db', // or ':memory:'
  camelCase: true,
  plugins: [], // layered on top
  functions: {}, // scalar UDFs, registered as deterministic (Node only)
})
```

```typescript
import { createSQLiteKysely } from '@pikku/kysely-sqlite'

// Pikku's own tables — returns Kysely<KyselyPikkuDB>, not your DB
const pikkuDb = createSQLiteKysely(database: SqliteDatabase | (() => Promise<SqliteDatabase>))
```

These two are not interchangeable. `createSQLiteKysely` is typed to
`KyselyPikkuDB` and wires the `SerializePlugin` (JSON columns in and out) rather
than the CamelCasePlugin, because it exists to back the stores below. Reach for
`createNodeSqliteKysely` / `createBunSqliteKysely` for the instance your
functions query.

### Available Services

Each database variant exports these services with a prefix (`Pg`, `MySQL`, `SQLite`, or base `Kysely`):

| Service                | Interface                                   | Purpose                                        |
| ---------------------- | ------------------------------------------- | ---------------------------------------------- |
| `*ChannelStore`        | `ChannelStore`                              | WebSocket channel state persistence            |
| `*EventHubStore`       | `EventHubStore`                             | Event hub state persistence                    |
| `*WorkflowService`     | `PikkuWorkflowService`                      | Workflow definition storage                    |
| `*WorkflowRunService`  | `WorkflowRunService`                        | Workflow execution tracking                    |
| `*DeploymentService`   | `DeploymentService`                         | Deployment state management                    |
| `*AgentStorageService` | `AgentStorageService, AgentRunStateService` | AI conversation/run storage                    |
| `*AgentRunService`     | `AgentRunService`                           | Agent execution tracking                       |
| `*SecretService`       | `SecretService`                             | Encrypted secret storage (envelope encryption) |

A handful more live only on the base package — there is no `Pg`/`MySQL`/`SQLite`
variant to reach for, you import them from `@pikku/kysely` whatever the engine:

| Service                      | Purpose                                      |
| ---------------------------- | -------------------------------------------- |
| `KyselySessionStore`         | Persisted user sessions                      |
| `KyselyScopeService`         | Scope and role storage                       |
| `KyselyWebhookService`       | Webhook registrations and deliveries         |
| `KyselyCredentialService`    | Encrypted third-party credentials            |
| `KyselyAgentRunStateService` | AI run state (also implemented by AIStorage) |
| `KyselyWorkflowMirror`       | Mirrors workflow runs into queryable tables  |
| `KyselyAuditService`         | Durable audit sink (see `pikku-audit`)       |

All services take a `Kysely<KyselyPikkuDB>` instance in their constructor and have an `init()` method that creates tables if needed.

### Secret Service

Envelope encryption: each secret gets its own DEK, wrapped by a KEK derived from
`key` plus a stored per-version salt. Keeping `previousKey` around is what makes
rotation possible — `rotateKEK` re-wraps every secret from the old key to the
current one and returns the new version, and it throws if no `previousKey` is
configured.

```typescript
import { PgKyselySecretService } from '@pikku/kysely-postgres'

const secrets = new PgKyselySecretService(db.kysely, {
  key: 'your-key-encryption-passphrase',
  keyVersion: 2, // defaults to 1
  previousKey: 'the-passphrase-you-are-rotating-away-from',
  audit: true, // log write/delete/rotate through the audit sink
  auditReads: false, // reads too — noisy, off by default
})
await secrets.init()

await secrets.setSecret('api-key', { key: 'sk-...' })
const secret = await secrets.getSecret<{ key: string }>('api-key')
await secrets.hasSecret('api-key')
await secrets.deleteSecret('api-key')
const newVersion = await secrets.rotateKEK()
```

`getSecret` hands back a `SecretValue<T>`, not the bare value — it serializes as
`[secret]` until something reveals it, which is what stops a secret drifting into
a log line or an audit row. See `pikku-config` for the reveal rules.

## Usage Patterns

### PostgreSQL Setup

```typescript
import {
  PikkuKysely,
  PgKyselyChannelStore,
  PgKyselyWorkflowService,
} from '@pikku/kysely-postgres'

const createSingletonServices = pikkuServices(async (config) => {
  const logger = new PinoLogger()
  const db = new PikkuKysely(logger, config.databaseUrl)
  await db.init()

  const channelStore = new PgKyselyChannelStore(db.kysely)
  await channelStore.init()

  const workflowService = new PgKyselyWorkflowService(db.kysely)
  await workflowService.init()

  return { config, logger, database: db, channelStore, workflowService }
})
```

### SQLite Setup

```typescript
import {
  createSQLiteKysely,
  SQLiteKyselyChannelStore,
} from '@pikku/kysely-sqlite'
import Database from 'better-sqlite3'

const kysely = createSQLiteKysely(new Database('app.db'))
const channelStore = new SQLiteKyselyChannelStore(kysely)
await channelStore.init()
```

### MySQL Setup

```typescript
import { MySQLKyselyWorkflowService } from '@pikku/kysely-mysql'

const workflowService = new MySQLKyselyWorkflowService(kyselyInstance)
await workflowService.init()
```
