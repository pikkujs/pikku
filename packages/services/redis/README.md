# @pikku/redis

Redis-backed implementations of the Pikku service interfaces — workflow state,
agent runs, secrets, sessions, and the channel and event-hub stores.

Uses `ioredis`. Distributed run locking is handled with `SET NX` plus a TTL, so
concurrent workers can safely share a run.

## Install

```bash
npm install @pikku/redis ioredis
```

## Usage

```typescript
import Redis from 'ioredis'
import { RedisWorkflowService } from '@pikku/redis'

const workflowService = new RedisWorkflowService(
  new Redis('redis://localhost:6379'),
  queueService,
  'workflows'
)

await workflowService.init()
```

The first argument also accepts a connection string or an `ioredis` options
object, in which case the service owns the connection and `close()` will end
it. Omit `queueService` to run workflows inline, which is useful in tests. The
third argument is the key prefix, defaulting to `workflows`.

## Docs

https://pikku.dev/docs

## License

MIT
