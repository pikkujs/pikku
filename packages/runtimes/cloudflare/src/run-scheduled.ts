import type { ScheduledController } from '@cloudflare/workers-types'
import { runScheduledTask } from '@pikku/core/ecosystem/scheduler'
import { getScheduledTasks } from '@pikku/core/ecosystem/scheduler'

export const runScheduled = async (controller: ScheduledController) => {
  const traceId = `cron-${crypto.randomUUID()}`
  const scheduledTasks = getScheduledTasks()
  for (const [name, task] of scheduledTasks) {
    if (task.schedule === controller.cron) {
      return await runScheduledTask({
        name,
        traceId,
      })
    }
  }
}
