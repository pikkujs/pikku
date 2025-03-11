import { ScheduledController } from '@cloudflare/workers-types'
import {
  CoreSingletonServices,
  CreateSessionServices,
  pikkuState,
} from '@pikku/core'
import { runScheduledTask } from '@pikku/core/scheduler'

export const runScheduled = async (
  controller: ScheduledController,
  singletonServices: CoreSingletonServices,
  createSessionServices?: CreateSessionServices
) => {
  const scheduledTasks = pikkuState('scheduler', 'tasks')
  for (const [name, task] of scheduledTasks) {
    if (task.schedule === controller.cron) {
      return await runScheduledTask({
        name,
        singletonServices,
        createSessionServices,
      })
    }
  }
}
