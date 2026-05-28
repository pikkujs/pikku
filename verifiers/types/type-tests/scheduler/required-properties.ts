/**
 * Type constraint: Scheduler must have required properties
 *
 * Schedulers require a name, schedule, and func property.
 */

import { wireScheduler, pikkuSessionlessFunc } from '#pikku'

const validTask = pikkuSessionlessFunc<void, void>(async () => {})

// Valid: All required properties present
wireScheduler({
  name: 'completeTask',
  schedule: '*/5 * * * *',
  func: validTask,
})

// Valid: Empty scheduler inline function
wireScheduler({
  name: 'minimalTask',
  schedule: '0 * * * *',
  func: pikkuSessionlessFunc<void, void>(async () => {
    // Empty implementation
  }),
})

// @ts-expect-error - Missing 'name' property
wireScheduler({
  schedule: '*/5 * * * *',
  func: validTask,
})

// @ts-expect-error - Missing 'schedule' property
wireScheduler({
  name: 'noScheduleTask',
  func: validTask,
})

// @ts-expect-error - Missing 'func' property
wireScheduler({
  name: 'noFuncTask',
  schedule: '*/5 * * * *',
})

// Valid: With optional tags
wireScheduler({
  name: 'taggedTask',
  schedule: '*/5 * * * *',
  func: validTask,
  tags: ['maintenance', 'cleanup'],
})

// Valid: With optional middleware
wireScheduler({
  name: 'middlewareTask',
  schedule: '*/5 * * * *',
  func: validTask,
  middleware: [],
})

wireScheduler({
  // @ts-expect-error - Name must be a string
  name: 123,
  schedule: '*/5 * * * *',
  func: validTask,
})

wireScheduler({
  name: 'invalidTags',
  schedule: '*/5 * * * *',
  func: validTask,
  // @ts-expect-error - Tags must be an array of strings if provided
  tags: 'not-an-array',
})
