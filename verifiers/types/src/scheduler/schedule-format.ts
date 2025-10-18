/**
 * Type constraint: Scheduler schedule property type safety
 *
 * The schedule property should be a string (cron expression).
 * This file tests that the type system enforces proper schedule types.
 */

import {
  wireScheduler,
  pikkuSessionlessFunc,
} from '../../.pikku/pikku-types.gen.js'

const validTask = pikkuSessionlessFunc<void, void>(async () => {})

// Valid: Various cron expressions
wireScheduler({
  name: 'everyMinute',
  schedule: '* * * * *',
  func: validTask,
})

// Valid: Schedule with template literal
wireScheduler({
  name: 'templateSchedule',
  schedule: `0 ${12} * * *`,
  func: validTask,
})

wireScheduler({
  name: 'invalidScheduleNumber',
  // @ts-expect-error - Schedule must be a string, not a number
  schedule: 5000,
  func: validTask,
})

wireScheduler({
  name: 'invalidScheduleObject',
  // @ts-expect-error - Schedule must be a string, not an object
  schedule: { interval: 5000 },
  func: validTask,
})

wireScheduler({
  name: 'invalidScheduleUndefined',
  // @ts-expect-error - Schedule must be a string, not undefined
  schedule: undefined,
  func: validTask,
})
