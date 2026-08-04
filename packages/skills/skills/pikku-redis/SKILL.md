---
name: pikku-redis
description: >-
  Use when setting up Redis-backed services in a Pikku app. Covers channel stores, workflow
  services, secret services, event hubs, agent runs, and deployment services backed by Redis.
  TRIGGER when: code uses RedisChannelStore, RedisWorkflowService, RedisSecretService, or user
  asks about Redis setup with Pikku. DO NOT TRIGGER when: user asks about BullMQ queues (use
  pikku-queue) or SQL databases (use pikku-kysely).
---

# Pikku Redis

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

`@pikku/redis` provides Redis-backed implementations of Pikku's core service interfaces using [ioredis](https://github.com/redis/ioredis).

## Installation

```bash
yarn add @pikku/redis
```

## API Reference

### Available Services

All services accept a Redis connection (ioredis `Redis` instance, `RedisOptions`, or connection string) in their constructor.

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

### Secret Service

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

## Usage Patterns

### Full Setup

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
