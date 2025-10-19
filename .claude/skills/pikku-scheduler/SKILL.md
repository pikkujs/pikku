---
name: pikku-scheduler
description: Guide for wiring Pikku functions to scheduled tasks (cron jobs). Use when creating periodic maintenance tasks, scheduled reports, automated cleanup jobs, or time-based operations.
---

# Pikku Scheduler Wiring Skill

This skill helps you wire Pikku functions to scheduled tasks using the generated adapter APIs.

## When to use this skill

- Creating periodic maintenance tasks
- Scheduled reports or data processing
- Automated cleanup jobs
- Time-based operations (daily, weekly, monthly)
- Background cron-like jobs

## Core Principles

The Scheduler adapter:

- Registers cron-like schedules
- Invokes your exported function on schedule

**Important:** Observability (logging/metrics/retries) is **not automatic**. Attach **PikkuMiddleware** either per-schedule or globally.

**Domain logic stays entirely in `packages/functions/src/functions/**/\*.function.ts`.\*\*

## File Naming Rules

- All scheduler wiring files must end with `.schedule.ts`
- Files can live anywhere under `packages/functions/src/`
- You may group multiple scheduler registrations in a single file (same-transport-only)

## Allowed Imports

✅ `wireScheduler`, `addSchedulerMiddleware` from `./pikku-types.gen.ts`, exported functions, middleware, optional config

❌ Never import from `./services/**`, implement business logic in wiring, or access env/globals directly

## Critical Rules

**Function Signature:**

- Cron jobs must use `pikkuFuncSessionless<void, void>` — aliased as **`pikkuVoidFunc`**
- Keep the job **thin**; orchestrate via `rpc.invoke()` if needed
- Don't perform manual auth checks; jobs are internal

## Basic Wiring

```typescript
import { wireScheduler } from './pikku-types.gen.js'
import { runMaintenance } from './functions/maintenance.function.js'

wireScheduler({
  cron: '0 3 * * *', // 03:00 UTC daily
  func: runMaintenance,
})
```

See `examples/basic.schedule.ts`.

## Middleware

**Per-schedule middleware:**

```typescript
wireScheduler({
  cron: '0 3 * * *',
  func: runMaintenance,
  middleware: [withSchedulerMetrics],
})
```

**Global middleware for all schedules:**

```typescript
import { addSchedulerMiddleware } from './pikku-types.gen.js'

addSchedulerMiddleware([withSchedulerMetrics, withRetry])
```

**IMPORTANT:** Guard for `interaction.scheduledTask` in middleware. See `examples/with-middleware.schedule.ts`.

## Cron Expressions

- Standard 5-field syntax: `min hour dom month dow`
- Interpreted as **UTC** (unless your runtime specifies otherwise)
- Prefer sourcing cron strings from config when they vary by environment

See `examples/with-cron-config.schedule.ts`.

## Grouping Schedules

You may group multiple schedules in one `.schedule.ts` file. See `examples/housekeeping.schedule.ts`.

## Examples

See `examples/` directory:

- `maintenance.function.ts` - Scheduled job function
- `basic.schedule.ts` - Simple schedule wiring
- `housekeeping.schedule.ts` - Multiple schedules grouped
- `with-middleware.schedule.ts` - Middleware usage
- `with-cron-config.schedule.ts` - Cron from config

## Review Checklist

- [ ] File name ends in `.schedule.ts`
- [ ] Adapter imports only from `./pikku-types.gen.ts`
- [ ] **CRITICAL: Functions use `pikkuVoidFunc` (pikkuFuncSessionless<void, void>)**
- [ ] Cron expressions are explicit or sourced from config
- [ ] If observability needed, middleware is attached
- [ ] Middleware guards for `interaction.scheduledTask`
- [ ] Functions defined in `./functions/**/*.function.ts`, not in wiring files
