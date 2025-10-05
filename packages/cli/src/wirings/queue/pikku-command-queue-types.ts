import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'
import { serializeQueueTypes } from './serialize-queue-types.js'

export const pikkuQueueTypes: PikkuCommandWithoutState = async (
  logger,
  { queueTypesFile }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating queue types',
    'Created queue types',
    [false],
    async () => {
      const content = serializeQueueTypes()
      await writeFileInDir(logger, queueTypesFile, content)
    }
  )
}
