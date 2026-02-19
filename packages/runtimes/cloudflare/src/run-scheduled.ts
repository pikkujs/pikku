import { ScheduledController } from '@cloudflare/workers-types'
import { CoreSingletonServices, CreateWireServices } from '@pikku/core'
import { runScheduledTask, getScheduledTasks } from '@pikku/core/scheduler'
import { createRunFunction } from '@pikku/core/function'

export const runScheduled = async (
  controller: ScheduledController,
  singletonServices: CoreSingletonServices,
  createWireServices?: CreateWireServices
) => {
  const runFunction = createRunFunction({
    singletonServices,
    createWireServices,
  })
  const scheduledTasks = getScheduledTasks()
  for (const [name, task] of scheduledTasks) {
    if (task.schedule === controller.cron) {
      return await runScheduledTask({
        name,
        runFunction,
        logger: singletonServices.logger,
      })
    }
  }
}
