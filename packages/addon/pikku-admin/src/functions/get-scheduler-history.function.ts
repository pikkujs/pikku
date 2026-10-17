import type { ScheduledTaskRuns } from '@pikku/core/scheduler'
import { pikkuFunc } from '#pikku/addon/function'

/**
 * Last run, next run and recent history per scheduled task, keyed by task name.
 *
 * Empty when the app wires no scheduler, or one that keeps no run history —
 * the in-memory scheduler `pikku dev` runs keeps the last 50 runs per task in
 * process, so this is the local copy's view and resets with the server.
 */
export const getSchedulerHistory = pikkuFunc<
  void,
  Record<string, ScheduledTaskRuns>
>({
  title: 'Get Scheduler History',
  description:
    'Returns each scheduled task with its last run, next run and recent runs (newest first). Empty when the app keeps no scheduler run history.',
  expose: true,
  scopes: ['admin:schedules:read'],
  func: async ({ schedulerService }) => {
    if (!schedulerService) {
      return {}
    }
    return schedulerService.getTaskRuns()
  },
})
