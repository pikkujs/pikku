---
name: pikku-cron
description: 'Use when adding scheduled tasks, recurring jobs, or cron-based automation to a Pikku app. Covers wireScheduler, cron expressions, scheduled task wire object, and scheduler middleware.'
---

# Pikku Cron/Scheduler Wiring

Wire Pikku functions to run on a schedule using cron expressions. Uses `pikkuVoidFunc` (no input/output).

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
  middleware?: PikkuMiddleware[],
})
```

### Wire Object (`wire.scheduledTask`)

Inside scheduled functions:

```typescript
wire.scheduledTask.name // Scheduler name
wire.scheduledTask.schedule // Cron expression string
wire.scheduledTask.executionTime // When this execution was triggered
wire.scheduledTask.skip(reason) // Skip this execution (no error)
```

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
      wire.scheduledTask.skip('No stale todos found')
      return
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
      wire.scheduledTask.skip('No expired sessions')
      return
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
