# Redis (`@pikku/redis`)

```bash
yarn add @pikku/redis
```

Redis-backed implementations of Pikku's core service interfaces, using
[ioredis](https://github.com/redis/ioredis). Every service accepts a Redis
connection — an ioredis `Redis` instance, `RedisOptions`, or a connection
string — in its constructor. None of them need an `init()` call.

| Service | Interface | Purpose |
| --- | --- | --- |
| `RedisChannelStore` | `ChannelStore` | WebSocket channel state persistence |
| `RedisEventHubStore` | `EventHubStore` | Event hub state persistence |
| `RedisWorkflowService` | `PikkuWorkflowService` | Workflow definition storage |
| `RedisWorkflowRunService` | `WorkflowRunService` | Workflow execution tracking |
| `RedisDeploymentService` | `DeploymentService` | Deployment state management |
| `RedisAgentRunService` | `AgentRunService` | Agent execution tracking |
| `RedisSecretService` | `SecretService` | Encrypted secret storage (envelope encryption) |
| `RedisSessionStore` | `SessionStore` | Persisted user sessions |

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

## Full setup

```typescript
import {
  RedisChannelStore,
  RedisWorkflowService,
  RedisSecretService,
} from '@pikku/redis'

const createSingletonServices = pikkuServices(async (config) => {
  const logger = new PinoLogger()

  const channelStore = new RedisChannelStore(config.redisUrl)
  const workflowService = new RedisWorkflowService(config.redisUrl)

  const secrets = new RedisSecretService(config.redisUrl, {
    key: config.kekPassphrase,
  })

  return { config, logger, channelStore, workflowService, secrets }
})
```
