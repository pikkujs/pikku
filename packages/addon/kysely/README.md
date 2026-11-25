# @pikku/addon-kysely

Kysely-backed implementations of the Pikku service interfaces — workflow state,
secrets, credentials, sessions, scopes, channel/event-hub stores and audit.

Dialect-neutral. Pair it with a dialect package (`@pikku/addon-kysely-postgres`,
`@pikku/addon-kysely-mysql`, `@pikku/addon-kysely-sqlite`) where the SQL differs.

## Install

```bash
npm install @pikku/addon-kysely kysely
```

## Usage

```typescript
import {
  KyselyLeaseService,
  KyselySecretService,
  KyselyWorkflowService,
} from '@pikku/addon-kysely'
import type { KyselyPikkuDB } from '@pikku/addon-kysely'
import type { Kysely } from 'kysely'

declare const db: Kysely<KyselyPikkuDB>

const leaseService = new KyselyLeaseService(db)
await leaseService.init()

const workflowService = new KyselyWorkflowService(db, { leaseService })
const secretService = new KyselySecretService(db, { key: encryptionKey })
```

The workflow service locks runs and steps on the `leaseService` you give it;
register the same instance as the app's `leaseService`.

## Docs

https://pikku.dev/docs
