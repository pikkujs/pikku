import { pikkuState } from '../../pikku-state.js'
import type { Logger } from '../../services/index.js'

export const logSchedulers = (logger: Logger) => {
  const scheduledTasks = pikkuState(null, 'scheduler', 'tasks')
  if (scheduledTasks.size === 0) {
    logger.info('No scheduled tasks added')
    return
  }

  let scheduledTasksMessage = 'Scheduled tasks:'
  scheduledTasks.forEach(({ schedule }, name) => {
    scheduledTasksMessage += `\n\t- ${name} -> ${schedule}`
  })
  logger.info(scheduledTasksMessage)
}
