# @pikku/kysely-postgres

Postgres services for Pikku — workflow state, secrets, channel and event-hub
stores — plus `PikkuKysely`, which owns the `postgres.js` connection pool.

Overrides the `@pikku/kysely` base services where Postgres SQL differs
(`LISTEN`/`NOTIFY` for the event hub).

## Install

```bash
npm install @pikku/kysely-postgres
```

## Usage

```typescript
import {
  PikkuKysely,
  PgKyselyLeaseService,
  PgKyselyWorkflowService,
} from '@pikku/kysely-postgres'
import type { KyselyPikkuDB } from '@pikku/kysely-postgres'

const { kysely } = new PikkuKysely<KyselyPikkuDB>(
  logger,
  variables.get('DATABASE_URL')
)

const leaseService = new PgKyselyLeaseService(kysely)
await leaseService.init()

const workflowService = new PgKyselyWorkflowService(kysely, { leaseService })
```

The workflow service locks runs and steps on the `leaseService` you give it;
register the same instance as the app's `leaseService`.

`PikkuKysely` also accepts an existing `postgres.Sql` instance or a
`postgres.Options` object, and takes optional pool settings.

## Docs

https://pikku.dev/docs
