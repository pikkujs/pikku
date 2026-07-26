# @pikku/kysely

Kysely-backed implementations of the Pikku service interfaces — workflow state,
secrets, credentials, sessions, scopes, channel/event-hub stores and audit.

Dialect-neutral. Pair it with a dialect package (`@pikku/kysely-postgres`,
`@pikku/kysely-mysql`, `@pikku/kysely-sqlite`) where the SQL differs.

## Install

```bash
npm install @pikku/kysely kysely
```

## Usage

```typescript
import { KyselyWorkflowService, KyselySecretService } from '@pikku/kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import type { Kysely } from 'kysely'

declare const db: Kysely<KyselyPikkuDB>

const workflowService = new KyselyWorkflowService(db)
const secretService = new KyselySecretService(db, { key: encryptionKey })
```

## Docs

https://pikku.dev/docs
