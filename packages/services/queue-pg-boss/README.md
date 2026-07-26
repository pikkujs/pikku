# @pikku/queue-pg-boss

pg-boss queue, worker and scheduler services for Pikku. Backed by Postgres, so
it needs no extra infrastructure if you already run one.

## Install

```bash
npm install @pikku/queue-pg-boss
```

## Usage

```typescript
import PgBoss from 'pg-boss'
import { PgBossQueueService } from '@pikku/queue-pg-boss'

const pgBoss = new PgBoss(connectionString)
await pgBoss.start()

const queue = new PgBossQueueService(pgBoss)
```

Use `PgBossQueueWorkers` to process jobs and `PgBossSchedulerService` for cron
wirings. For a Redis-backed alternative see `@pikku/queue-bullmq`.

## Docs

https://pikku.dev/docs
