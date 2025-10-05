import {
  logCommandInfoAndTime,
  writeFileInDir,
  getFileImportRelativePath,
} from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'
import { serializeQueueTypes } from './serialize-queue-types.js'

export const pikkuQueueTypes: PikkuCommandWithoutState = async (
  logger,
  { queueTypesFile, functionTypesFile, packageMappings }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating queue types',
    'Created queue types',
    [false],
    async () => {
      const functionTypesImportPath = getFileImportRelativePath(
        queueTypesFile,
        functionTypesFile,
        packageMappings
      )
      const content = serializeQueueTypes(functionTypesImportPath)
      await writeFileInDir(logger, queueTypesFile, content)
    }
  )
}
