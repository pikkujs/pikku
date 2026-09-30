# Redis (`@pikku/redis`)

```bash
yarn add @pikku/redis
```

Redis-backed implementations of Pikku's core service interfaces, using
[ioredis](https://github.com/redis/ioredis). Every service accepts a Redis
connection — an ioredis `Redis` instance, `RedisOptions`, or a connection
string — in its constructor. None of them need an `init()` call.

| Service                   | Interface              | Purpose                                        |
| ------------------------- | ---------------------- | ---------------------------------------------- |
| `RedisChannelStore`       | `ChannelStore`         | WebSocket channel state persistence            |
| `RedisEventHubStore`      | `EventHubStore`        | Event hub state persistence                    |
| `RedisWorkflowService`    | `PikkuWorkflowService` | Workflow definition storage                    |
| `RedisWorkflowRunService` | `WorkflowRunService`   | Workflow execution tracking                    |
| `RedisDeploymentService`  | `DeploymentService`    | Deployment state management                    |
| `RedisAgentRunService`    | `AgentRunService`      | Agent execution tracking                       |
| `RedisSecretService`      | `SecretService`        | Encrypted secret storage (envelope encryption) |
| `RedisSessionStore`       | `SessionStore`         | Persisted user sessions                        |
| `RedisLeaseService`       | `LeaseService`         | Named leases with fencing tokens               |

There is no Redis implementation of `AgentStorageService` — AI conversation
storage is MongoDB-only.

## `RedisSecretService`

Envelope encryption: `key` derives the KEK that wraps each secret's own DEK.
Keeping `previousKey` set is what makes `rotateKEK()` possible — it re-wraps
every secret onto the current key and returns the new version.

```typescript
import { RedisSecretService } from '@pikku/redis'

const secrets = new RedisSecretService(
  connectionOrConfig: Redis | RedisOptions | string,
  config: {
    key: string          // the KEK passphrase
    keyVersion?: number  // defaults to 1
    previousKey?: string // required to rotate
    keyPrefix?: string   // namespaces the redis keys
  }
)

await secrets.getSecret<T = string>(key: string): Promise<T>
await secrets.getSecrets<T>(keys: (keyof T & string)[]): Promise<Partial<T>>
await secrets.hasSecret(key: string): Promise<boolean>
await secrets.setSecret(key: string, value: unknown): Promise<void>
await secrets.deleteSecret(key: string): Promise<void>
await secrets.rotateKEK(): Promise<number>
await secrets.close(): Promise<void>
```

## `RedisLeaseService`

Each lease is a hash Redis expires itself, and every check-and-set is one Lua
script that reads the time with `TIME`, so a lease is judged — and its
`expiresAt` reported — on Redis's clock, never the worker's. A fast worker
clock can neither take a live lease nor stretch its own.

The token comes from a counter stored beside the lease that release never
deletes, so the next holder always gets a higher token. That counter is one
small key per lease name, kept forever. On a replicated Redis with async
failover a promoted replica can miss the latest `INCR`, so a token is only as
durable as the write it rode on.

```typescript
import { RedisLeaseService } from '@pikku/redis'
import { holdLease } from '@pikku/core/services'

const leaseService = new RedisLeaseService(config.redisUrl, {
  keyPrefix: 'pikku', // lease keys are `<prefix>:lease:{<key>}`
})

await holdLease(leaseService, 'nightly-report', async (lease, signal) => {
  // ...
})
```

## Full setup

```typescript
import {
  RedisChannelStore,
  RedisLeaseService,
  RedisWorkflowService,
  RedisSecretService,
} from '@pikku/redis'

const createSingletonServices = pikkuServices(async (config) => {
  const logger = new PinoLogger()

  const channelStore = new RedisChannelStore(config.redisUrl)
  const leaseService = new RedisLeaseService(config.redisUrl)
  const workflowService = new RedisWorkflowService(config.redisUrl, {
    leaseService,
  })

  const secrets = new RedisSecretService(config.redisUrl, {
    key: config.kekPassphrase,
  })

  return {
    config,
    logger,
    channelStore,
    leaseService,
    workflowService,
    secrets,
  }
})
```
