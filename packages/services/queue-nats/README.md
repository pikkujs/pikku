# @pikku/queue-nats

NATS JetStream queue, worker and scheduler services for Pikku. Backed by a
JetStream work-queue stream, with the schedules living in the broker rather
than in a database.

Requires a NATS server on 2.14 or newer — that is the release that added
repeating cron schedules, and `NatsServiceFactory` refuses to start against
anything older rather than silently not scheduling.

## Install

```bash
npm install @pikku/queue-nats
```

## Usage

```typescript
import { NatsServiceFactory } from '@pikku/queue-nats'

const factory = new NatsServiceFactory({
  servers: 'nats://localhost:4222',
  streamName: 'pikku',
  subjectPrefix: 'pikku',
})
await factory.init()

const queue = factory.getQueueService()
const workers = factory.getQueueWorkers()

await workers.registerQueues()
```

Use `NatsSchedulerService` for cron wirings. For a Postgres-backed alternative
see `@pikku/queue-pg-boss`, and for a Redis-backed one `@pikku/queue-bullmq`.

## Job results

`supportsResults` is `false`. A work-queue stream deletes a message the moment
it is acked, so there is nowhere for a job result — or any job history — to
live. Per-job outcomes come from telemetry, not from the broker; producers that
need a return value should use an RPC rather than a queue.

## Docs

https://pikku.dev/docs
