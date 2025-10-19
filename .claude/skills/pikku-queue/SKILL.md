---
name: pikku-queue
description: Guide for wiring Pikku functions to background queues. Use when creating background job workers, processing async tasks, handling email/notifications, or implementing job queues with concurrency control.
---

# Pikku Queue Wiring Skill

This skill helps you wire Pikku functions to background queues using the generated adapter APIs.

## When to use this skill

- Creating background job workers
- Processing async tasks
- Handling email/notification jobs
- Implementing job queues with concurrency control
- Setting up retry and visibility timeout policies

## Core Principles

The Queue adapter:

- Subscribes a worker to a named queue
- Delivers each job payload as the function's `data`
- Honors the function's `auth` and `permissions` (usually unnecessary for internal jobs)

**Domain logic stays entirely in `packages/functions/src/functions/**/\*.function.ts`.\*\*

## File Naming Rules

- Queue wiring files must end with `.queue.ts`
- Files can live anywhere under `packages/functions/src/`
- You may group multiple queue workers in a single file (same-transport-only)

## Allowed Imports

✅ `wireQueueWorker` from `./pikku-types.gen.ts`, exported functions, optional middleware, optional config

❌ Never import from `./services/**`, implement business logic in wiring, or access env/globals directly

## Critical Rules

**⚠️ Auth and Permissions:**

- Queue workers are **internal background jobs** without user sessions
- If a function has `auth: true` or `permissions`, it's likely **wrong for queue usage**
- Queue workers should typically set `auth: false` or use `pikkuFuncSessionless`
- Only use auth/permissions if explicitly setting a service account session

**Don't create unnecessary wrappers:**

- If an existing function does what you need, wire it directly
- Don't create a wrapper that just calls `rpc.invoke()` - wire the actual function instead

## Function Patterns

- Prefer `pikkuFuncSessionless`
- Use `void` for `Out` generic when no return value
- Functions must be `async`
- Keep functions thin

See `examples/email-worker.function.ts` for a complete example.

## Basic Wiring

```typescript
import { wireQueueWorker } from './pikku-types.gen.js'
import { sendEmail } from './functions/email.function.js'

wireQueueWorker({
  queue: 'email',
  func: sendEmail,
  // concurrency?: number
  // visibilityTimeoutSec?: number
})
```

## Grouping Workers

You may group multiple queue workers in one `.queue.ts` file. See `examples/billing.queue.ts`.

## Worker Configuration Options

**IMPORTANT: Not all configuration options are supported by all queue types.**
Different queue adapters (BullMQ, SQS, Redis, etc.) support different subsets of these options.
See the specific queue adapter skill (e.g., `pikku-queue-bullmq`, `pikku-queue-sqs`) for details on which options are supported.

Configure worker behavior using the `config` property:

```typescript
wireQueueWorker({
  queue: 'email',
  func: sendEmail,
  config: {
    batchSize: 10,
    visibilityTimeout: 300,
    // ... other options
  },
})
```

**Available Options** (support varies by queue type):

**Processing:**

- `batchSize?: number` - Messages to process in batch/parallel
- `prefetch?: number` - Messages to prefetch for efficiency
- `pollInterval?: number` - Polling interval for pull-based queues (ms)

**Timeouts:**

- `visibilityTimeout?: number` - Message visibility timeout (seconds)
- `lockDuration?: number` - Job lock duration (ms)
- `drainDelay?: number` - Wait time when queue is empty (seconds)

**Job Management:**

- `removeOnComplete?: number` - Keep N completed jobs
- `removeOnFail?: number` - Keep N failed jobs
- `maxStalledCount?: number` - Max job recovery attempts

**Other:**

- `name?: string` - Worker name for monitoring
- `autorun?: boolean` - Auto-start processor

**Best Practice:** Source from config, not hardcode. See `examples/with-config.queue.ts`.

## Middleware

Use middleware for **lightweight concerns only** (audit/tracing), not retries/metrics.
Queue adapters already provide retry/DLQ policies.

See `examples/with-middleware.queue.ts`.

## Error Handling

- Throw `PikkuError` subclasses for expected failures
- Let failures bubble so the queue runtime applies native retry/DLQ policies
- Don't reimplement retry logic in middleware

## Examples

See `examples/` directory:

- `email-worker.function.ts` - Basic worker function
- `basic.queue.ts` - Simple queue wiring
- `billing.queue.ts` - Multiple workers grouped
- `with-middleware.queue.ts` - Middleware usage
- `with-config.queue.ts` - Concurrency configuration

## Review Checklist

- [ ] File ends with `.queue.ts`
- [ ] Adapter imports only from `./pikku-types.gen.ts`
- [ ] **⚠️ CRITICAL: Functions don't have `auth: true` or `permissions` unless explicitly needed**
- [ ] No unnecessary wrapper functions
- [ ] Worker functions are `async` with `void` for `Out` when no return
- [ ] Middleware is lightweight (not retries/metrics)
- [ ] Functions defined in `./functions/**/*.function.ts`, not in wiring files
