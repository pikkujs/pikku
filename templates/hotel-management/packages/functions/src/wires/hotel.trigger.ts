import { wireTrigger } from '#pikku/trigger/pikku-trigger-types.gen.js'
import { wireScheduler } from '#pikku/scheduler'
import { onArrivalDue } from '../functions/on-arrival-due.function.js'
import { sweepDueArrivals } from '../functions/sweep-due-arrivals.function.js'

// @snippet start wireTrigger
// The handler is in its own file — Pikku resolves trigger metadata per file, so
// declaring it beside the wiring gets it skipped as "metadata not found".
wireTrigger({
  name: 'hotel-due',
  func: onArrivalDue,
})

// A scheduled task, not a `setInterval` inside a trigger source. Clock-driven
// work is what `wireScheduler` is for: one pass, callable by hand, provable.
wireScheduler({
  name: 'sweepDueArrivals',
  schedule: '*/5 * * * *',
  func: sweepDueArrivals,
})
// @snippet end wireTrigger
