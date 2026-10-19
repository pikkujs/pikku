import { wireScheduler } from '#pikku/scheduler'
import { sweepStuckRuns } from '../functions/sweep-stuck-runs.function.js'

// @snippet start wireScheduler
wireScheduler({
  name: 'sweepStuckRuns',
  // Every ten minutes. The window between a worker dying and the run being
  // marked failed is how long an operator stares at a run that is not moving.
  schedule: '*/10 * * * *',
  func: sweepStuckRuns,
})
// @snippet end wireScheduler
