import { wireScheduler } from './pikku-types.gen.js'
import { runMaintenance, rotateKeys } from './functions/maintenance.function.js'

/**
 * Multiple schedules grouped in one file
 * All for the same transport (scheduler)
 */

// Daily maintenance at 03:00 UTC
wireScheduler({
  cron: '0 3 * * *',
  func: runMaintenance,
})

// Weekly key rotation on Sundays at 04:00 UTC
wireScheduler({
  cron: '0 4 * * 0',
  func: rotateKeys,
})
