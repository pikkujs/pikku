import { wireScheduler } from '#pikku/scheduler'
import {
  dailySummary,
  weeklyCleanup,
} from '../functions/scheduled.functions.js'

// @snippet start wire-scheduler
wireScheduler({
  name: 'dailySummary',
  schedule: '0 9 * * *',
  func: dailySummary,
  tags: ['daily', 'summary'],
})
// @snippet end wire-scheduler

wireScheduler({
  name: 'weeklyCleanup',
  schedule: '0 2 * * 0',
  func: weeklyCleanup,
  tags: ['weekly', 'cleanup', 'maintenance'],
})
