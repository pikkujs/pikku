# @pikku/kysely-mysql

MySQL dialect services for Pikku — workflow state, secrets, channel and
event-hub stores.

Overrides the `@pikku/kysely` base services where MySQL SQL differs.

This package does not open a connection — construct your own `Kysely` instance
with the MySQL dialect and driver of your choice, then pass it in.

## Install

```bash
npm install @pikku/kysely-mysql
```

## Usage

```typescript
import {
  MySQLKyselyLeaseService,
  MySQLKyselyWorkflowService,
} from '@pikku/kysely-mysql'
import type { KyselyPikkuDB } from '@pikku/kysely-mysql'
import { Kysely, MysqlDialect } from 'kysely'

const db = new Kysely<KyselyPikkuDB>({
  dialect: new MysqlDialect({ pool }),
})

const leaseService = new MySQLKyselyLeaseService(db)
await leaseService.init()

const workflowService = new MySQLKyselyWorkflowService(db, { leaseService })
```

The workflow service locks runs and steps on the `leaseService` you give it;
register the same instance as the app's `leaseService`.

## Docs

https://pikku.dev/docs
