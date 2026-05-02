---
name: pikku-schedule
description: 'Use when setting up in-memory cron scheduling in a Pikku app. Covers InMemorySchedulerService for running scheduled tasks.
TRIGGER when: code uses InMemorySchedulerService, PikkuTaskScheduler, or user asks about in-memory scheduling, cron jobs without external dependencies, or @pikku/schedule.
DO NOT TRIGGER when: user asks about cron wiring (use pikku-cron) or queue-based scheduling with BullMQ/PgBoss (use pikku-queue).'
---

# Pikku Schedule (In-Memory Scheduler)

`@pikku/schedule` provides an in-memory cron scheduler for running Pikku scheduled functions without external dependencies like Redis or PostgreSQL.

## Installation

```bash
yarn add @pikku/schedule
```

## API Reference

### `InMemorySchedulerService`

```typescript
import { InMemorySchedulerService } from '@pikku/schedule'

const scheduler = new InMemorySchedulerService()
```

Implements the scheduler service interface. Schedules are held in memory — they do not survive process restarts. Suitable for development and single-instance deployments.

## Usage Patterns

### Basic Setup

```typescript
import { InMemorySchedulerService } from '@pikku/schedule'

const createSingletonServices = pikkuServices(async (config) => {
  const scheduler = new InMemorySchedulerService()
  return { config, scheduler }
})
```

For distributed or persistent scheduling, use BullMQ (`BullSchedulerService`) or PgBoss (`PgBossSchedulerService`) from the queue packages instead. See `pikku-queue` for details.
