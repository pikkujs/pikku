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

const { db } = new PikkuMongoDB(logger, 'mongodb://localhost:27017')

const workflowService = new MongoDBWorkflowService(db)
```

`PikkuMongoDB` also accepts an existing `MongoClient`, in which case it will not
close the connection on shutdown.

## Docs

https://pikku.dev/docs
