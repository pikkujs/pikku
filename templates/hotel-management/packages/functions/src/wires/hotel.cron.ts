import { wireScheduler } from '#pikku/scheduler'
import { sweepNoShows } from '../functions/sweep-no-shows.function.js'

/**
 * 04:00 is deliberate: after the night audit and before the early shift, so a
 * receptionist arriving at 06:00 sees an arrivals list that is already true.
 */
// @snippet start wireScheduler
wireScheduler({
  name: 'sweepNoShows',
  schedule: '0 4 * * *',
  func: sweepNoShows,
})
// @snippet end wireScheduler
