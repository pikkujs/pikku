---
name: pikku-queue
description: "Use when adding background job processing, async task queues, or distributed workers to a Pikku app. Covers wireQueueWorker, job enqueuing, progress tracking, retries, BullMQ and PgBoss adapters."
---

# Pikku Queue Wiring

Wire Pikku functions as background queue workers. Supports job control (progress, retry, discard), configurable concurrency, and type-safe job publishing.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and their types
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## API Reference

### `wireQueueWorker(config)`

```typescript
import { wireQueueWorker } from '@pikku/core/queue'

wireQueueWorker({
  name: string,            // Queue name (unique identifier)
  func: PikkuFunc,         // Worker function
  config?: {
    batchSize?: number,    // Process N jobs at once
    removeOnComplete?: number | boolean,  // Clean up completed jobs
  },
})
```

### Wire Object (`wire.queue`)

Inside queue worker functions:

```typescript
wire.queue.updateProgress(percent: number)  // Report progress (0-100)
wire.queue.discard(reason: string)          // Silently discard job
wire.queue.fail(reason: string)             // Mark job as failed
```

### Job Publishing

```typescript
const jobId = await queue.add(queueName, data, options?)
```

Options:
```typescript
{
  priority?: number,       // Higher = processed first
  delay?: number,          // Delay in ms before processing
  attempts?: number,       // Max retry attempts
  backoff?: {
    type: 'exponential' | 'fixed',
    delay: number,         // Base delay in ms
  },
}
```

## Usage Patterns

### Basic Queue Worker

```typescript
const processReminder = pikkuSessionlessFunc({
  title: 'Process Reminder',
  func: async ({ db, emailService }, { todoId, userId }) => {
    const todo = await db.getTodo(todoId)
    await emailService.sendReminder(userId, todo)
    return { sent: true }
  },
})

wireQueueWorker({
  name: 'todo-reminders',
  func: processReminder,
})
```

### Job Control (Progress, Discard, Fail)

```typescript
const processReminder = pikkuSessionlessFunc({
  title: 'Process Reminder',
  func: async ({ db }, { todoId }, wire) => {
    await wire.queue.updateProgress(25)

    const todo = await db.getTodo(todoId)
    if (!todo) {
      await wire.queue.discard('Todo not found')
      return
    }

    if (todo.completed) {
      await wire.queue.fail('Todo already completed')
      return
    }

    await wire.queue.updateProgress(100)
    return { sent: true }
  },
})
```

### Retries & Configuration

```typescript
wireQueueWorker({
  name: 'todo-reminders',
  func: processReminder,
  config: {
    batchSize: 5,
    removeOnComplete: 100,
  },
})

// Enqueue with retry options
const jobId = await queue.add('todo-reminders', {
  todoId: 'abc-123',
  userId: 'user-456',
}, {
  priority: 10,
  delay: 5000,
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
})
```

### Type-Safe Queue Publishing

After `npx pikku prebuild`:

```typescript
import { PikkuQueue } from '.pikku/pikku-queue.gen.js'

const queue = new PikkuQueue(queueService)

const jobId = await queue.add('todo-reminders', {
  todoId: 'abc-123',
  userId: 'user-456',
})

const job = await queue.getJob('todo-reminders', jobId)
const status = await job.status()  // 'waiting' | 'active' | 'completed' | 'failed'
const result = await job.waitForCompletion(30_000)
```

### Queue Adapters

**BullMQ** (Redis-based):
```typescript
import { BullMQQueueService } from '@pikku/queue-bullmq'

const queueService = new BullMQQueueService({
  connection: { host: 'localhost', port: 6379 },
})
```

**PgBoss** (PostgreSQL-based):
```typescript
import { PgBossQueueService } from '@pikku/queue-pg-boss'

const queueService = new PgBossQueueService({
  connectionString: 'postgres://...',
})
```

## Complete Example

```typescript
// functions/email.functions.ts
export const sendWelcomeEmail = pikkuSessionlessFunc({
  title: 'Send Welcome Email',
  func: async ({ emailService, db }, { userId }, wire) => {
    await wire.queue.updateProgress(10)

    const user = await db.getUser(userId)
    if (!user) {
      await wire.queue.discard('User not found')
      return
    }

    await wire.queue.updateProgress(50)
    await emailService.send({
      to: user.email,
      subject: 'Welcome!',
      template: 'welcome',
      data: { name: user.name },
    })

    await wire.queue.updateProgress(100)
    return { sent: true, email: user.email }
  },
})

// wirings/queue.wiring.ts
wireQueueWorker({
  name: 'welcome-emails',
  func: sendWelcomeEmail,
  config: { removeOnComplete: 100 },
})

// Enqueue from another function
export const registerUser = pikkuSessionlessFunc({
  title: 'Register User',
  func: async ({ db, queue }, { email, name }) => {
    const user = await db.createUser({ email, name })
    await queue.add('welcome-emails', { userId: user.id })
    return { user }
  },
})
```
