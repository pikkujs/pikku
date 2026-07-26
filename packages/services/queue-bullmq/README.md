# @pikku/queue-bullmq

BullMQ queue, worker and scheduler services for Pikku. Backed by Redis, with
job results, retries and priorities.

## Install

```bash
npm install @pikku/queue-bullmq
```

## Usage

```typescript
import { BullQueueService, BullQueueWorkers } from '@pikku/queue-bullmq'

const queue = new BullQueueService({ host: 'localhost', port: 6379 })

const workers = new BullQueueWorkers({ host: 'localhost', port: 6379 })

await workers.registerQueues()
```

Use `BullSchedulerService` for cron wirings. For a Postgres-backed alternative
see `@pikku/queue-pg-boss`.

## Docs

https://pikku.dev/docs
