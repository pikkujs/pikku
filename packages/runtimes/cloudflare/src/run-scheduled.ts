import { ScheduledController } from '@cloudflare/workers-types'
import { CoreSingletonServices, CreateSessionServices } from '@pikku/core'
import { runScheduledTask, getScheduledTasks } from '@pikku/core/scheduler'

export const runScheduled = async (
  controller: ScheduledController,
  singletonServices: CoreSingletonServices,
  createSessionServices?: CreateSessionServices
) => {
  const scheduledTasks = getScheduledTasks()
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
