import { wireScheduler } from '#pikku/scheduler'
import { publishScheduled } from '../functions/publish-scheduled.function.js'

// @snippet start wireScheduler
wireScheduler({
  name: 'publishScheduled',
  // Every five minutes. The public read is already correct on the clock, so
  // this is about the editorial list agreeing with it — five minutes of a post
  // showing as "scheduled" while it is live is a cosmetic lag, not an outage.
  schedule: '*/5 * * * *',
  func: publishScheduled,
})
// @snippet end wireScheduler
