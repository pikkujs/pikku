import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'
import { serializeSchedulerTypes } from './serialize-scheduler-types.js'

export const pikkuSchedulerTypes: PikkuCommandWithoutState = async (
  logger,
  { schedulersTypesFile }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating scheduler types',
    'Created scheduler types',
    [false],
    async () => {
      const content = serializeSchedulerTypes()
      await writeFileInDir(logger, schedulersTypesFile, content)
    }
  )
}
