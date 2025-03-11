import { pikkuState } from '../pikku-state.js'
import { Logger } from '../services/index.js'

/**
 * Logs all the loaded channels.
 * @param logger - A logger for logging information.
 */
export const logChannels = (logger: Logger) => {
  const channels = pikkuState('channel', 'channels')
  if (channels.length === 0) {
    logger.info('No channels added')
    return
  }

  let scheduledChannels = 'Channels:'
  for (const { name, route } of channels) {
    scheduledChannels += `\n\t- ${name} at ${route}`
  }
  logger.info(scheduledChannels)
}
