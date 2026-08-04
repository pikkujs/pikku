---
name: pikku-schedule
description: >-
  Use when setting up in-memory cron scheduling in a Pikku app. Covers InMemorySchedulerService
  for running scheduled tasks. TRIGGER when: code uses InMemorySchedulerService,
  PikkuTaskScheduler, or user asks about in-memory scheduling, cron jobs without external
  dependencies, or @pikku/schedule. DO NOT TRIGGER when: user asks about cron wiring (use
  pikku-cron) or queue-based scheduling with BullMQ/PgBoss (use pikku-queue).
installGroups: [core]
---

# Pikku Schedule (In-Memory Scheduler)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

`@pikku/schedule` provides an in-memory cron scheduler for running Pikku scheduled functions without external dependencies like Redis or PostgreSQL.

## Installation

```bash
yarn add @pikku/schedule
```

## API Reference

### `InMemorySchedulerService`

```typescript
import { InMemorySchedulerService } from '@pikku/schedule'

const schedulerService = new InMemorySchedulerService()
await schedulerService.start() // registers a CronJob per wired scheduled task
```

It implements core's `SchedulerService` on two mechanisms: `cron` for the
recurring tasks you declared with `wireScheduler` (see `pikku-cron`), and
`setTimeout` for one-off delayed RPCs. Both live in process memory, so nothing
survives a restart and nothing is shared between instances — fine for
development and a single-instance deployment, wrong for anything else.

`PikkuTaskScheduler` is a deprecated alias for the same class.

### Scheduling a one-off RPC

```typescript
const taskId = await schedulerService.scheduleRPC('5m', 'sendReminder', data, session)
await schedulerService.getTask(taskId) // { rpcName, scheduledFor, status, … } | null
await schedulerService.getAllTasks() // pending one-offs only
await schedulerService.unschedule(taskId) // true when it was still pending
```

The delay is milliseconds or a duration string (`'30s'`, `'5m'`, `'2h'`). This is
also the mechanism a workflow's delayed steps use, which is why a workflow that
sleeps needs a `schedulerService` registered.

## Usage Patterns

### Basic Setup

The scheduler is a singleton service under the name **`schedulerService`**, and
it is started in your server bootstrap — declaring it without calling `start()`
registers no cron jobs, so nothing ever fires:

```typescript
// start.ts
import { InMemorySchedulerService } from '@pikku/schedule'

const schedulerService = new InMemorySchedulerService()
const singletonServices = await createSingletonServices(config, {
  schedulerService,
})

await appServer.start()
await schedulerService.start()
```

Call `close()` on shutdown — it stops every cron job and clears pending timers.

For distributed or persistent scheduling, take the scheduler service off the
queue factory instead (`bullFactory.getSchedulerService()`,
`pgBossFactory.getSchedulerService()`) and register it under the same name. See
`pikku-queue`.
