import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'
import { serializeCLITypes } from './serialize-cli-types.js'

export const pikkuCLITypes: PikkuCommandWithoutState = async (
  logger,
  { cliTypesFile }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating CLI types',
    'Created CLI types',
    [false],
    async () => {
      const content = serializeCLITypes()
      await writeFileInDir(logger, cliTypesFile, content)
    }
  )
}
