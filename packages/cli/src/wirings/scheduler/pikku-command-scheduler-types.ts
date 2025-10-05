import {
  logCommandInfoAndTime,
  writeFileInDir,
  getFileImportRelativePath,
} from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'
import { serializeSchedulerTypes } from './serialize-scheduler-types.js'

export const pikkuSchedulerTypes: PikkuCommandWithoutState = async (
  logger,
  { schedulersTypesFile, functionTypesFile, packageMappings }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating scheduler types',
    'Created scheduler types',
    [false],
    async () => {
      const functionTypesImportPath = getFileImportRelativePath(
        schedulersTypesFile,
        functionTypesFile,
        packageMappings
      )
      const content = serializeSchedulerTypes(functionTypesImportPath)
      await writeFileInDir(logger, schedulersTypesFile, content)
    }
  )
}
