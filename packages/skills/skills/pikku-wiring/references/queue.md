# Pikku Queue Wiring

## API Reference

### `wireQueueWorker(config)`

```typescript
import { wireQueueWorker } from '#pikku/queue'

wireQueueWorker({
  name: string,            // Queue name (unique identifier)
  func: PikkuFunc,         // Worker function
  config?: {
    batchSize?: number,           // Total worker concurrency
    prefetch?: number,
    pollInterval?: number,        // ms
    visibilityTimeout?: number,   // seconds
    lockDuration?: number,        // ms
    drainDelay?: number,          // seconds
    removeOnComplete?: number,    // how many completed jobs to RETAIN (a count, not an age)
    removeOnFail?: number,        // how many failed jobs to RETAIN
    maxStalledCount?: number,
    autorun?: boolean,
    groupConcurrency?: number | GroupConcurrencyConfig,  // must not exceed batchSize
  },
})
```

Not every adapter supports every option. Each adapter declares a
`QueueConfigMapping`, and unsupported keys are dropped with a warning rather than
silently ignored — so check the startup logs if a setting appears to have no
effect.

`groupConcurrency` limits how many jobs run concurrently _per group_ (jobs
carrying a `JobGroup` with an `id` and optional `tier`), so one noisy tenant
cannot consume the whole worker:

```typescript
groupConcurrency: { default: 2, tiers: { enterprise: 10 } }
```

### Wire Object (`wire.queue`)

Inside queue worker functions:

```typescript
wire.queue.updateProgress(progress: number | string | object)  // Report progress
wire.queue.discard(reason?: string)   // Silently discard job (throws QueueJobDiscardedError)
wire.queue.fail(reason?: string)      // Mark job as failed
```

`updateProgress` is not limited to a 0-100 percentage — a string or an object
lets a long job report a stage ("rendering page 4/20") that a dashboard can show
directly.

### Job Publishing

```typescript
const jobId = await queue.add(queueName, data, options?)
```

Options:

```typescript
{
  retryAttempts?: number,   // Max retry attempts
  retryDelay?: number,      // Base delay in ms
  retryBackoff?: 'linear' | 'exponential' | 'fixed',
  deadLetterQueue?: string, // Where exhausted jobs land
  messageRetention?: number,// Seconds
  priority?: number,        // Higher numbers run first
  fifo?: boolean,
  timeout?: number,         // ms
  delay?: number,           // ms before the job becomes eligible
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
const jobId = await queue.add(
  'todo-reminders',
  {
    todoId: 'abc-123',
    userId: 'user-456',
  },
  {
    priority: 10,
    delay: 5000,
    retryAttempts: 3,
    retryBackoff: 'exponential',
    retryDelay: 1000,
  }
)
```

### Type-Safe Queue Publishing

After `npx pikku all`:

```typescript
import { PikkuQueue } from '#pikku/pikku-queue.gen.js'

const queue = new PikkuQueue(queueService)

const jobId = await queue.add('todo-reminders', {
  todoId: 'abc-123',
  userId: 'user-456',
})

const job = await queue.getJob('todo-reminders', jobId)
const status = await job.status() // 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
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
