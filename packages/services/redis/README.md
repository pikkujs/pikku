# @pikku/redis

Redis-backed implementations of the Pikku service interfaces — workflow state,
agent runs, secrets, sessions, and the channel and event-hub stores.

Uses `ioredis`. `RedisLeaseService` implements leases with `SET NX` plus a TTL,
and the workflow service locks runs and steps on whichever `leaseService` it is
given, so concurrent workers can safely share a run.

## Install

```bash
npm install @pikku/redis ioredis
```

## Usage

```typescript
import Redis from 'ioredis'
import { RedisLeaseService, RedisWorkflowService } from '@pikku/redis'

const redis = new Redis('redis://localhost:6379')
const leaseService = new RedisLeaseService(redis)

const workflowService = new RedisWorkflowService(redis, {
  leaseService,
  keyPrefix: 'workflows',
})

await workflowService.init()
```

The first argument also accepts a connection string or an `ioredis` options
object, in which case the service owns the connection and `close()` will end
it. `keyPrefix` defaults to `workflows`. Register the same `leaseService` as the
app's `leaseService`.

## Docs

https://pikku.dev/docs

## License

MIT
