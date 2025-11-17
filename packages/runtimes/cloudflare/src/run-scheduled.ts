import { ScheduledController } from '@cloudflare/workers-types'
import { CoreSingletonServices, CreateInteractionServices } from '@pikku/core'
import { runScheduledTask, getScheduledTasks } from '@pikku/core/scheduler'

export const runScheduled = async (
  controller: ScheduledController,
  singletonServices: CoreSingletonServices,
  createInteractionServices?: CreateInteractionServices
) => {
  const scheduledTasks = getScheduledTasks()
  for (const [name, task] of scheduledTasks) {
    if (task.schedule === controller.cron) {
      return await runScheduledTask({
        name,
        singletonServices,
        createInteractionServices,
      })
    }
  }
}
