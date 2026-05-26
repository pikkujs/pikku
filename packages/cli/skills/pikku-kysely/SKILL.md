---
name: pikku-kysely
description: 'Use when setting up SQL database services with Kysely in a Pikku app. Covers @pikku/kysely (base), @pikku/kysely-postgres, @pikku/kysely-mysql, @pikku/kysely-sqlite — channel stores, workflow services, secret services, AI storage, agent runs, and deployment services.
TRIGGER when: code uses Kysely, PikkuKysely, KyselyChannelStore, KyselyWorkflowService, KyselySecretService, or user asks about SQL database setup, Postgres/MySQL/SQLite with Pikku.
DO NOT TRIGGER when: user asks about MongoDB (use pikku-mongodb) or Redis (use pikku-redis).'
installGroups: [core]
---

# Pikku Kysely (SQL Database Services)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Pikku provides SQL database services through four packages:
- `@pikku/kysely` — Base service implementations (database-agnostic)
- `@pikku/kysely-postgres` — PostgreSQL-specific implementations + `PikkuKysely` connection wrapper
- `@pikku/kysely-mysql` — MySQL-specific implementations
- `@pikku/kysely-sqlite` — SQLite-specific implementations + `createSQLiteKysely` factory

All implement standard Pikku interfaces from `@pikku/core`.

## Installation

```bash
# Pick your database
yarn add @pikku/kysely @pikku/kysely-postgres   # PostgreSQL
yarn add @pikku/kysely @pikku/kysely-mysql      # MySQL
yarn add @pikku/kysely @pikku/kysely-sqlite     # SQLite
```

## API Reference

### PostgreSQL Connection — `PikkuKysely`

```typescript
import { PikkuKysely } from '@pikku/kysely-postgres'

const db = new PikkuKysely<DB>(
  logger: Logger,
  connectionOrConfig: postgres.Sql | postgres.Options | string,
  defaultSchemaName?: string
)

await db.init()
db.kysely  // Kysely<DB> instance for queries
await db.close()
```

### SQLite Factory — `createSQLiteKysely`

```typescript
import { createSQLiteKysely } from '@pikku/kysely-sqlite'

const kysely = createSQLiteKysely(database: SqliteDatabase | (() => Promise<SqliteDatabase>))
```

### Available Services

Each database variant exports these services with a prefix (`Pg`, `MySQL`, `SQLite`, or base `Kysely`):

| Service | Interface | Purpose |
|---------|-----------|---------|
| `*ChannelStore` | `ChannelStore` | WebSocket channel state persistence |
| `*EventHubStore` | `EventHubStore` | Event hub state persistence |
| `*WorkflowService` | `PikkuWorkflowService` | Workflow definition storage |
| `*WorkflowRunService` | `WorkflowRunService` | Workflow execution tracking |
| `*DeploymentService` | `DeploymentService` | Deployment state management |
| `*AIStorageService` | `AIStorageService, AIRunStateService` | AI conversation/run storage |
| `*AgentRunService` | `AgentRunService` | Agent execution tracking |
| `*SecretService` | `SecretService` | Encrypted secret storage (envelope encryption) |

All services take a `Kysely<KyselyPikkuDB>` instance in their constructor and have an `init()` method that creates tables if needed.

### Secret Service

```typescript
import { PgKyselySecretService } from '@pikku/kysely-postgres'

const secrets = new PgKyselySecretService(db.kysely, {
  kekSecret: 'your-key-encryption-key',
  salt: 'your-salt',
})
await secrets.init()

await secrets.setSecretJSON('api-key', { key: 'sk-...' })
const value = await secrets.getSecretJSON<{ key: string }>('api-key')
await secrets.rotateKEK() // Re-encrypt all secrets with new KEK
```

## Usage Patterns

### PostgreSQL Setup

```typescript
import { PikkuKysely, PgKyselyChannelStore, PgKyselyWorkflowService } from '@pikku/kysely-postgres'

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
import { createSQLiteKysely, SQLiteKyselyChannelStore } from '@pikku/kysely-sqlite'
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
