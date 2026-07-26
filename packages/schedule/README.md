# @pikku/schedule

In-memory scheduler service for Pikku cron wirings, built on `cron`.

Runs jobs in the current process, so it suits single-instance deployments and
local development. For multi-instance setups use a queue-backed scheduler such
as `@pikku/queue-bullmq` or `@pikku/queue-pg-boss`.

## Install

```bash
npm install @pikku/schedule
```

## Usage

```typescript
import { InMemorySchedulerService } from '@pikku/schedule'

const scheduler = new InMemorySchedulerService(logger)

await scheduler.init()
scheduler.startAll()
```

## Docs

https://pikku.dev/docs
