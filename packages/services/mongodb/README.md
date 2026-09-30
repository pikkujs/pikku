# @pikku/mongodb

MongoDB implementations of the Pikku service interfaces — workflow state, agent
runs, secrets, and the channel and event-hub stores.

## Install

```bash
npm install @pikku/mongodb
```

## Usage

```typescript
import { PikkuMongoDB, MongoDBWorkflowService } from '@pikku/mongodb'
import { RedisLeaseService } from '@pikku/redis'

const { db } = new PikkuMongoDB(logger, 'mongodb://localhost:27017')

const leaseService = new RedisLeaseService('redis://localhost:6379')

const workflowService = new MongoDBWorkflowService(db, { leaseService })
```

The workflow service locks runs and steps on the `leaseService` you give it,
and this package ships none: pair it with `RedisLeaseService`, a Kysely lease
service, or `InMemoryLeaseService` from `@pikku/core/services` for a single
process. Register the same instance as the app's `leaseService`.

`PikkuMongoDB` also accepts an existing `MongoClient`, in which case it will not
close the connection on shutdown.

## Docs

https://pikku.dev/docs
