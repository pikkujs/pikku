import { ScheduledController } from '@cloudflare/workers-types'
import { CoreSingletonServices, CreateWireServices } from '@pikku/core'
import { runScheduledTask, getScheduledTasks } from '@pikku/core/scheduler'

export const runScheduled = async (
  controller: ScheduledController,
  singletonServices: CoreSingletonServices,
  createWireServices?: CreateWireServices
) => {
  const scheduledTasks = getScheduledTasks()
  for (const [name, task] of scheduledTasks) {
    if (task.schedule === controller.cron) {
      return await runScheduledTask({
        name,
        singletonServices,
        createWireServices,
      })
    }
  }
}
