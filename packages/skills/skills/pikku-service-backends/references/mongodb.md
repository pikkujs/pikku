# MongoDB (`@pikku/mongodb`)

```bash
yarn add @pikku/mongodb
```

## `PikkuMongoDB` — connection wrapper

Every service below takes a `Db`, so the wrapper is constructed and initialised
first.

```typescript
import { PikkuMongoDB } from '@pikku/mongodb'

const mongo = new PikkuMongoDB(
  logger: Logger,
  clientOrUri: MongoClient | string,
  dbName: string,
  options?: MongoClientOptions
)

await mongo.init()
mongo.db  // Db instance for queries
await mongo.close()
```

## Available services

| Service | Interface | Purpose |
| --- | --- | --- |
| `MongoDBChannelStore` | `ChannelStore` | WebSocket channel state persistence |
| `MongoDBEventHubStore` | `EventHubStore` | Event hub state persistence |
| `MongoDBWorkflowService` | `PikkuWorkflowService` | Workflow definition storage |
| `MongoDBWorkflowRunService` | `WorkflowRunService` | Workflow execution tracking |
| `MongoDBDeploymentService` | `DeploymentService` | Deployment state management |
| `MongoDBAgentStorageService` | `AgentStorageService`, `AgentRunStateService` | AI conversation/run storage |
| `MongoDBAgentRunService` | `AgentRunService` | Agent execution tracking |
| `MongoDBSecretService` | `SecretService` | Encrypted secret storage (envelope encryption) |
| `MongoDBSessionStore` | `SessionStore` | Persisted user sessions |

All of them take a `Db` in the constructor and have an `init()` method that
creates the collections and indexes. **Await it** — a service used without it
behaves like an unindexed collection.

## `MongoDBSecretService`

Envelope encryption: `key` derives the KEK that wraps each secret's own DEK.
Keeping `previousKey` set is what makes `rotateKEK()` possible — it re-wraps
every secret onto the current key and returns the new version.

```typescript
import { MongoDBSecretService } from '@pikku/mongodb'

const secrets = new MongoDBSecretService(mongo.db, {
  key: 'your-key-encryption-passphrase',
  keyVersion: 2, // defaults to 1
  previousKey: 'the-passphrase-you-are-rotating-away-from',
  audit: true, // log write/delete/rotate through the audit sink
  auditReads: false, // reads too — noisy, off by default
})
await secrets.init()

await secrets.setSecret('api-key', { key: 'sk-...' })
const value = await secrets.getSecret<{ key: string }>('api-key')
await secrets.rotateKEK()
```

## Full setup

```typescript
import {
  PikkuMongoDB,
  MongoDBChannelStore,
  MongoDBWorkflowService,
} from '@pikku/mongodb'

const createSingletonServices = pikkuServices(async (config) => {
  const logger = new PinoLogger()
  const mongo = new PikkuMongoDB(logger, config.mongoUri, 'myapp')
  await mongo.init()

  const channelStore = new MongoDBChannelStore(mongo.db)
  await channelStore.init()

  const workflowService = new MongoDBWorkflowService(mongo.db)
  await workflowService.init()

  return { config, logger, database: mongo, channelStore, workflowService }
})
```
