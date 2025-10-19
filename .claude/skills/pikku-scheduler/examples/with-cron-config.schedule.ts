import { wireScheduler } from './pikku-types.gen.js'
import { runMaintenance } from './functions/maintenance.function.js'

/**
 * Scheduler with cron expression from static config
 * Prefer sourcing cron strings from config when they vary by environment
 */

// Static cron configuration (imported from config file or defined inline)
const schedulerConfig = {
  maintenanceCron: '0 3 * * *', // 03:00 UTC daily
}

wireScheduler({
  cron: schedulerConfig.maintenanceCron,
  func: runMaintenance,
})
