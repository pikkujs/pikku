---
name: pikku-schedule
description: >-
  Use when adding scheduled tasks, recurring jobs, or cron-based automation to a Pikku app. Covers
  wireScheduler, cron expressions, the scheduled task wire object, and scheduler middleware.
  TRIGGER when: code uses wireScheduler, user asks about cron, scheduled tasks, recurring jobs, or
  "run every X minutes/hours". DO NOT TRIGGER when: user asks about background jobs with retries
  (use pikku-queue) or event-driven triggers (use pikku-trigger).
installGroups: [core]
---

# Pikku Scheduled Tasks

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Wire Pikku functions to run on a schedule using cron expressions. Uses `pikkuVoidFunc` (no input/output).

`pikku dev`, `pikku serve` and the standalone deploy adapter each register a scheduler service for you, so a wired task runs without any setup. Only register one yourself when deploying somewhere those do not reach, and then take it off the queue factory (`bullFactory.getSchedulerService()`, `pgBossFactory.getSchedulerService()` — see `pikku-queue`) so it survives a restart and is shared between instances.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and their types
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## API Reference

### `wireScheduler(config)`

```typescript
import { wireScheduler } from '@pikku/core/scheduler'

wireScheduler({
  name: string,            // Unique scheduler name
  schedule: string,        // Cron expression
  func: PikkuVoidFunc,     // Must be pikkuVoidFunc (no input/output)
  tags?: string[],         // Targets tag middleware — see pikku-middleware
  middleware?: PikkuMiddleware[],
})
```

### Giving a cron an identity

A cron has no caller, so it runs with **no session at all**: it cannot invoke a
permission- or scope-gated RPC, and nothing it writes can be attributed. A
scheduled task is a machine principal — give it a session in the task's own
`middleware`, exactly as a bearer-authenticated caller gets one:

```typescript
wireScheduler({
  name: 'bookingLifecycleDaily',
  schedule: '0 3 * * *',
  middleware: [cronSession],
  func: bookingLifecycleDaily,
})
```

`runScheduledTask` builds its wire with a `sessionService`, so a `setSession`
here is the session the function is frozen with. See the machine-auth section of
`pikku-middleware` for the factory and for why a cron is not a user row.

A scheduler service running a task on someone's behalf can pass a session
directly instead: `runScheduledTask({ name, session })`.

### Wire Object (`wire.scheduledTask`)

Inside scheduled functions:

```typescript
wire.scheduledTask.name // Scheduler name
wire.scheduledTask.schedule // Cron expression string
wire.scheduledTask.executionTime // Date this execution was triggered
wire.scheduledTask.skip(reason?) // Abort this execution — THROWS, never returns
```

**`skip()` aborts by throwing.** It reads like an early return but it is not:
nothing after the call runs, so there is no need to `return` afterwards. The
consequence that bites is in middleware — a `try/catch` around `await next()`
will catch a skip and report it as a failure. If your middleware distinguishes
success from failure, let the skip pass through rather than logging it as an
error.

### Cron Expression Reference

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-7, 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

Common patterns:

| Expression    | Meaning                    |
| ------------- | -------------------------- |
| `*/5 * * * *` | Every 5 minutes            |
| `0 9 * * *`   | Daily at 9:00 AM           |
| `0 9 * * 1`   | Every Monday at 9:00 AM    |
| `0 0 1 * *`   | First of month at midnight |
| `0 */6 * * *` | Every 6 hours              |
| `30 2 * * 0`  | Sundays at 2:30 AM         |

## Usage Patterns

### Basic Scheduled Task

```typescript
const dailySummary = pikkuVoidFunc({
  title: 'Daily Summary',
  func: async ({ db, emailService, logger }) => {
    logger.info('Generating daily summary')
    const stats = await db.getDailyStats()
    await emailService.sendSummary(stats)
  },
})

wireScheduler({
  name: 'dailySummary',
  schedule: '0 9 * * *',
  func: dailySummary,
})
```

### Using the Wire Object

```typescript
const weeklyCleanup = pikkuVoidFunc({
  title: 'Weekly Cleanup',
  func: async ({ db, logger }, _input, wire) => {
    logger.info(`Running: ${wire.scheduledTask.name}`)
    logger.info(`Schedule: ${wire.scheduledTask.schedule}`)
    logger.info(`Execution time: ${wire.scheduledTask.executionTime}`)

    const staleCount = await db.countStaleTodos()
    if (staleCount === 0) {
      wire.scheduledTask.skip('No stale todos found') // throws — nothing below runs
    }

    await db.deleteCompletedTodos({ olderThan: '30d' })
    logger.info(`Cleaned ${staleCount} stale todos`)
  },
})

wireScheduler({
  name: 'weeklyCleanup',
  schedule: '0 0 * * 0',
  func: weeklyCleanup,
})
```

### Scheduler Middleware

```typescript
const schedulerMetrics = pikkuMiddleware(
  async ({ logger }, { scheduledTask }, next) => {
    const start = Date.now()
    logger.info(`Task started: ${scheduledTask.name}`)

    try {
      await next()
      logger.info(`Task completed: ${scheduledTask.name}`, {
        duration: Date.now() - start,
      })
    } catch (error) {
      logger.error(`Task failed: ${scheduledTask.name}`, {
        error: error.message,
        duration: Date.now() - start,
      })
      throw error
    }
  }
)

wireScheduler({
  name: 'dailySummary',
  schedule: '0 9 * * *',
  func: dailySummary,
  middleware: [schedulerMetrics],
})
```

## Complete Example

```typescript
// functions/scheduled.functions.ts
export const dailySummary = pikkuVoidFunc({
  title: 'Daily Summary',
  func: async ({ db, emailService, logger }) => {
    const stats = await db.getDailyStats()
    await emailService.sendSummary(stats)
    logger.info('Daily summary sent', { stats })
  },
})

export const cleanupExpired = pikkuVoidFunc({
  title: 'Cleanup Expired',
  func: async ({ db, logger }, _input, wire) => {
    const count = await db.countExpiredSessions()
    if (count === 0) {
      wire.scheduledTask.skip('No expired sessions') // throws — nothing below runs
    }
    await db.deleteExpiredSessions()
    logger.info(`Cleaned ${count} expired sessions`)
  },
})

export const syncInventory = pikkuVoidFunc({
  title: 'Sync Inventory',
  func: async ({ inventoryApi, db, logger }) => {
    const updates = await inventoryApi.getChanges()
    await db.applyInventoryUpdates(updates)
    logger.info(`Synced ${updates.length} inventory changes`)
  },
})

// wirings/scheduler.wiring.ts
wireScheduler({
  name: 'dailySummary',
  schedule: '0 9 * * *',
  func: dailySummary,
})
wireScheduler({
  name: 'cleanupExpired',
  schedule: '0 */6 * * *',
  func: cleanupExpired,
})
wireScheduler({
  name: 'syncInventory',
  schedule: '*/15 * * * *',
  func: syncInventory,
})
```
