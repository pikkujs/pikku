import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'
import { serializeHTTPTypes } from './serialize-http-types.js'

export const pikkuHTTPTypes: PikkuCommandWithoutState = async (
  logger,
  { httpTypesFile }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating HTTP types',
    'Created HTTP types',
    [false],
    async () => {
      const content = serializeHTTPTypes()
      await writeFileInDir(logger, httpTypesFile, content)
    }
  )
}
