import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'
import { serializeChannelTypes } from './serialize-channel-types.js'

export const pikkuChannelTypes: PikkuCommandWithoutState = async (
  logger,
  { channelsTypesFile }
) => {
  if (!channelsTypesFile) {
    logger.warn('channelsTypesFile is not configured, skipping')
    return false
  }
  return await logCommandInfoAndTime(
    logger,
    'Creating channel types',
    'Created channel types',
    [false],
    async () => {
      const content = serializeChannelTypes()
      await writeFileInDir(logger, channelsTypesFile, content)
    }
  )
}
