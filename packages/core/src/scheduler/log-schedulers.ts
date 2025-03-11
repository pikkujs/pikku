import { pikkuState } from '../pikku-state.js'
import { Logger } from '../services/index.js'

/**
 * Logs all the loaded scheduled tasks.
 * @param logger - A logger for logging information.
 */
export const logSchedulers = (logger: Logger) => {
  const scheduledTasks = pikkuState('scheduler', 'tasks')
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
