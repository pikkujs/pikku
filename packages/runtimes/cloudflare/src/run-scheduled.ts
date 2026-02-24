import { ScheduledController } from '@cloudflare/workers-types'
import { runScheduledTask, getScheduledTasks } from '@pikku/core/scheduler'

export const runScheduled = async (controller: ScheduledController) => {
  const scheduledTasks = getScheduledTasks()
  for (const [name, task] of scheduledTasks) {
    if (task.schedule === controller.cron) {
      return await runScheduledTask({
        name,
      })
    }
  }
}
