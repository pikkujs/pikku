import { wireScheduler } from '#pikku/pikku-types.gen.js'
import {
  dailySummary,
  weeklyCleanup,
} from '../functions/scheduled.functions.js'

// Daily summary at 9 AM
wireScheduler({
  name: 'dailySummary',
  schedule: '0 9 * * *',
  func: dailySummary,
  tags: ['daily', 'summary'],
})

// Weekly cleanup on Sundays at 2 AM
wireScheduler({
  name: 'weeklyCleanup',
  schedule: '0 2 * * 0',
  func: weeklyCleanup,
  tags: ['weekly', 'cleanup', 'maintenance'],
})
