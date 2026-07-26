# @pikku/kysely-postgres

Postgres services for Pikku — workflow state, secrets, channel and event-hub
stores — plus `PikkuKysely`, which owns the `postgres.js` connection pool.

Overrides the `@pikku/kysely` base services where Postgres SQL differs
(advisory locks, `LISTEN`/`NOTIFY` for the event hub).

## Install

```bash
npm install @pikku/kysely-postgres
```

## Usage

```typescript
import { PikkuKysely, PgKyselyWorkflowService } from '@pikku/kysely-postgres'
import type { KyselyPikkuDB } from '@pikku/kysely-postgres'

const { kysely } = new PikkuKysely<KyselyPikkuDB>(
  logger,
  variables.get('DATABASE_URL')
)

const workflowService = new PgKyselyWorkflowService(kysely)
```

`PikkuKysely` also accepts an existing `postgres.Sql` instance or a
`postgres.Options` object, and takes optional pool settings.

## Docs

https://pikku.dev/docs
