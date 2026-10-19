import { wireScheduler } from '#pikku/scheduler'
import { sweepOverdueJobs } from '../functions/reports/sweep-overdue-jobs.function.js'

/**
 * The overdue sweep.
 *
 * Runs before the dispatchers are at their desks, so the first thing on the
 * board in the morning is the work that slipped yesterday.
 */
wireScheduler({
  name: 'sweepOverdueJobs',
  schedule: '0 6 * * *',
  func: sweepOverdueJobs,
})
