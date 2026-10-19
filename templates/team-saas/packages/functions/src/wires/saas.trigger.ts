import { wireTrigger } from '#pikku/trigger/pikku-trigger-types.gen.js'
import { wireScheduler } from '#pikku/scheduler'
import { onSeatsExceeded } from '../functions/on-seats-exceeded.function.js'
import { sweepSeatUsage } from '../functions/sweep-seat-usage.function.js'

// @snippet start wireTrigger
wireTrigger({
  name: 'seats-exceeded',
  func: onSeatsExceeded,
})

// A scheduled task, not a `setInterval` inside a trigger source. Clock-driven
// work is what `wireScheduler` is for: one pass, callable by hand, provable.
wireScheduler({
  name: 'sweepSeatUsage',
  schedule: '*/5 * * * *',
  func: sweepSeatUsage,
})
// @snippet end wireTrigger
