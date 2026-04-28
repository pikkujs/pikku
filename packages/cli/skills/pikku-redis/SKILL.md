---
name: pikku-redis
description: 'Use when setting up Redis-backed services in a Pikku app. Covers channel stores, workflow services, secret services, event hubs, agent runs, and deployment services backed by Redis.
TRIGGER when: code uses RedisChannelStore, RedisWorkflowService, RedisSecretService, or user asks about Redis setup with Pikku.
DO NOT TRIGGER when: user asks about BullMQ queues (use pikku-queue) or SQL databases (use pikku-kysely).'
---

# Pikku Redis

`@pikku/redis` provides Redis-backed implementations of Pikku's core service interfaces using [ioredis](https://github.com/redis/ioredis).

## Installation

```bash
yarn add @pikku/redis
```

## API Reference

### Available Services

All services accept a Redis connection (ioredis `Redis` instance, `RedisOptions`, or connection string) in their constructor.

| Service | Interface | Purpose |
|---------|-----------|---------|
| `RedisChannelStore` | `ChannelStore` | WebSocket channel state persistence |
| `RedisEventHubStore` | `EventHubStore` | Event hub state persistence |
| `RedisWorkflowService` | `PikkuWorkflowService` | Workflow definition storage |
| `RedisWorkflowRunService` | `WorkflowRunService` | Workflow execution tracking |
| `RedisDeploymentService` | `DeploymentService` | Deployment state management |
| `RedisAgentRunService` | `AgentRunService` | Agent execution tracking |
| `RedisSecretService` | `SecretService` | Encrypted secret storage (envelope encryption) |

### Secret Service

```typescript
import { RedisSecretService } from '@pikku/redis'

const secrets = new RedisSecretService(
  connectionOrConfig: Redis | RedisOptions | string,
  config: { kekSecret: string; salt: string }
)

await secrets.getSecret(key: string): Promise<string>
await secrets.getSecretJSON<R>(key: string): Promise<R>
await secrets.hasSecret(key: string): Promise<boolean>
await secrets.setSecretJSON(key: string, value: unknown): Promise<void>
await secrets.deleteSecret(key: string): Promise<void>
await secrets.rotateKEK(): Promise<number>
await secrets.close(): Promise<void>
```

## Usage Patterns

### Full Setup

```typescript
import { RedisChannelStore, RedisWorkflowService, RedisSecretService } from '@pikku/redis'

const createSingletonServices = pikkuServices(async (config) => {
  const logger = new PinoLogger()

  const channelStore = new RedisChannelStore(config.redisUrl)
  const workflowService = new RedisWorkflowService(config.redisUrl)

  const secrets = new RedisSecretService(config.redisUrl, {
    kekSecret: config.kekSecret,
    salt: config.salt,
  })

  return { config, logger, channelStore, workflowService, secrets }
})
```
