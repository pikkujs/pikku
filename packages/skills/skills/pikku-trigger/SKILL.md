---
name: pikku-trigger
description: >-
  Use when adding event-driven functions that respond to system events like Redis pub/sub,
  PostgreSQL LISTEN/NOTIFY, or custom event sources. Covers wireTrigger, wireTriggerSource, and
  pikkuTriggerFunc. TRIGGER when: code uses wireTrigger/wireTriggerSource/pikkuTriggerFunc, user
  asks about event-driven functions, Redis pub/sub, PostgreSQL LISTEN/NOTIFY, or reacting to
  external events. DO NOT TRIGGER when: user asks about scheduled tasks (use pikku-cron) or
  background job queues (use pikku-queue).
installGroups: [core]
---

# Pikku Trigger Wiring

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Wire Pikku functions to fire when external events occur. Triggers connect event sources (Redis pub/sub, PostgreSQL LISTEN/NOTIFY, polling, webhooks) to Pikku functions.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and their types
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## API Reference

### `wireTrigger(config)`

Define the target function that handles trigger events:

```typescript
import { wireTrigger } from '@pikku/core/trigger'

wireTrigger({
  name: string, // Trigger name (matches source)
  func: PikkuFunc, // Function to call when event fires
})
```

### `wireTriggerSource(config)`

Define the event source that fires triggers:

```typescript
import { wireTriggerSource } from '@pikku/core/trigger'

wireTriggerSource({
  name: string, // Must match wireTrigger name
  func: PikkuTriggerFunc, // Source function (sets up listener)
  input: object, // Configuration for the source
})
```

### `pikkuTriggerFunc<TInput, TEvent>`

Define a trigger source function. Returns a cleanup function.

```typescript
import { pikkuTriggerFunc } from '#pikku'

const source = pikkuTriggerFunc<
  InputType, // Configuration input
  EventType // Shape of events it emits
>(async (services, input, { trigger }) => {
  // Set up listener...
  trigger.invoke(eventData) // Fire the trigger

  // Return cleanup function
  return async () => {
    /* teardown */
  }
})
```

## Usage Patterns

### Redis Pub/Sub Source

```typescript
const redisSubscribe = pikkuTriggerFunc<
  { channels: string[] },
  { channel: string; message: any }
>(async ({ redis }, { channels }, { trigger }) => {
  const subscriber = redis.duplicate()

  subscriber.on('message', (channel, message) => {
    trigger.invoke({ channel, message: JSON.parse(message) })
  })

  await subscriber.subscribe(...channels)

  return async () => {
    await subscriber.unsubscribe()
    await subscriber.quit()
  }
})

// Target function
const onOrderEvent = pikkuSessionlessFunc({
  title: 'On Order Event',
  func: async ({ db, logger }, { channel, message }) => {
    logger.info(`Order event on ${channel}`, message)
    await db.processOrderEvent(message)
  },
})

// Wire them together
wireTrigger({
  name: 'order-events',
  func: onOrderEvent,
})

wireTriggerSource({
  name: 'order-events',
  func: redisSubscribe,
  input: { channels: ['orders:created', 'orders:updated'] },
})
```

### Triggers vs Queues

| Feature     | Trigger                            | Queue                          |
| ----------- | ---------------------------------- | ------------------------------ |
| Execution   | Synchronous, in-process            | Async, distributed             |
| Reliability | At-most-once                       | At-least-once (with retries)   |
| Use case    | React to events immediately        | Reliable background processing |
| Source      | External systems (Redis, PG, etc.) | Enqueued programmatically      |

Use triggers for real-time reactions. Use queues for reliable, retryable background work.

## Complete Example

```typescript
// functions/triggers.functions.ts
const pgListen = pikkuTriggerFunc<{ channel: string }, { payload: any }>(
  async ({ db }, { channel }, { trigger }) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(channel)) {
      throw new Error(`Invalid channel name: ${channel}`)
    }
    const client = await db.pool.connect()

    client.on('notification', (msg) => {
      trigger.invoke({ payload: JSON.parse(msg.payload) })
    })

    await client.query(`LISTEN ${channel}`)

    return async () => {
      await client.query(`UNLISTEN ${channel}`)
      client.release()
    }
  }
)

const onUserCreated = pikkuSessionlessFunc({
  title: 'On User Created',
  func: async ({ emailService, logger }, { payload }) => {
    logger.info('New user created', { userId: payload.id })
    await emailService.sendWelcome(payload.email)
  },
})

// wirings/triggers.wiring.ts
wireTrigger({ name: 'user-created', func: onUserCreated })
wireTriggerSource({
  name: 'user-created',
  func: pgListen,
  input: { channel: 'user_created' },
})
```
