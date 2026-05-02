---
name: pikku-mongodb
description: 'Use when setting up MongoDB database services in a Pikku app. Covers PikkuMongoDB connection, channel stores, workflow services, secret services, AI storage, agent runs, and deployment services.
TRIGGER when: code uses PikkuMongoDB, MongoDBChannelStore, MongoDBWorkflowService, MongoDBSecretService, or user asks about MongoDB setup with Pikku.
DO NOT TRIGGER when: user asks about SQL databases (use pikku-kysely) or Redis (use pikku-redis).'
---

# Pikku MongoDB

`@pikku/mongodb` provides MongoDB-backed implementations of Pikku's core service interfaces.

## Installation

```bash
yarn add @pikku/mongodb
```

## API Reference

### `PikkuMongoDB` (Connection Wrapper)

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

### Available Services

| Service | Interface | Purpose |
|---------|-----------|---------|
| `MongoDBChannelStore` | `ChannelStore` | WebSocket channel state persistence |
| `MongoDBEventHubStore` | `EventHubStore` | Event hub state persistence |
| `MongoDBWorkflowService` | `PikkuWorkflowService` | Workflow definition storage |
| `MongoDBWorkflowRunService` | `WorkflowRunService` | Workflow execution tracking |
| `MongoDBDeploymentService` | `DeploymentService` | Deployment state management |
| `MongoDBAIStorageService` | `AIStorageService, AIRunStateService` | AI conversation/run storage |
| `MongoDBAgentRunService` | `AgentRunService` | Agent execution tracking |
| `MongoDBSecretService` | `SecretService` | Encrypted secret storage (envelope encryption) |

All services take a `Db` instance in their constructor and have an `init()` method that creates collections/indexes.

### Secret Service

```typescript
import { MongoDBSecretService } from '@pikku/mongodb'

const secrets = new MongoDBSecretService(mongo.db, {
  kekSecret: 'your-key-encryption-key',
  salt: 'your-salt',
})
await secrets.init()

await secrets.setSecretJSON('api-key', { key: 'sk-...' })
const value = await secrets.getSecretJSON<{ key: string }>('api-key')
await secrets.rotateKEK()
```

## Usage Patterns

### Full Setup

```typescript
import { PikkuMongoDB, MongoDBChannelStore, MongoDBWorkflowService } from '@pikku/mongodb'

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
