import { pikkuState } from '../../pikku-state.js'
import { Logger } from '../../services/index.js'

/**
 * Logs all the loaded channels.
 * @param logger - A logger for logging information.
 */
export const logChannels = (logger: Logger) => {
  const channels = pikkuState(null, 'channel', 'channels')
  if (channels.size === 0) {
    logger.info('No channels added')
    return
  }

  let scheduledChannels = 'Channels:'
  channels.forEach((channel) => {
    scheduledChannels += `\n\t- ${channel.name} at ${channel.route}`
  })
  logger.info(scheduledChannels)
}
