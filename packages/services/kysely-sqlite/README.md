# @pikku/kysely-sqlite

SQLite dialect services for Pikku — workflow state, secrets, channel and
event-hub stores — plus `LibsqlWebDialect` for libSQL/Turso over HTTP.

Takes a `SqliteDatabase` rather than opening one, so it works with any SQLite
driver. For the runtime built-ins use `@pikku/kysely-node-sqlite` or
`@pikku/kysely-bun-sqlite`.

## Install

```bash
npm install @pikku/kysely-sqlite
```

## Usage

```typescript
import {
  createSQLiteKysely,
  SQLiteKyselyWorkflowService,
} from '@pikku/kysely-sqlite'
import { KyselyLeaseService } from '@pikku/kysely'
import Database from 'better-sqlite3'

const db = createSQLiteKysely(new Database('app.db'))

const leaseService = new KyselyLeaseService(db)
await leaseService.init()

const workflowService = new SQLiteKyselyWorkflowService(db, { leaseService })
```

The workflow service locks runs and steps on the `leaseService` you give it;
register the same instance as the app's `leaseService`.

## Docs

https://pikku.dev/docs
