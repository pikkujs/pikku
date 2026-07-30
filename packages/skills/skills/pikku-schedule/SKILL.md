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

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
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
