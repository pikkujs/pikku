import { wireScheduler } from './pikku-types.gen.js'
import { runMaintenance } from './functions/maintenance.function.js'

/**
 * Basic scheduler wiring
 * Runs daily at 03:00 UTC
 *
 * The runMaintenance function is defined in ./functions/maintenance.function.ts
 * using pikkuVoidFunc
 */
wireScheduler({
  cron: '0 3 * * *', // 03:00 UTC daily
  func: runMaintenance,
})
