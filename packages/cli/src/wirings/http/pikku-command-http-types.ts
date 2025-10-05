import {
  logCommandInfoAndTime,
  writeFileInDir,
  getFileImportRelativePath,
} from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'
import { serializeHTTPTypes } from './serialize-http-types.js'

export const pikkuHTTPTypes: PikkuCommandWithoutState = async (
  logger,
  { httpTypesFile, functionTypesFile, packageMappings }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating HTTP types',
    'Created HTTP types',
    [false],
    async () => {
      const functionTypesImportPath = getFileImportRelativePath(
        httpTypesFile,
        functionTypesFile,
        packageMappings
      )
      const content = serializeHTTPTypes(functionTypesImportPath)
      await writeFileInDir(logger, httpTypesFile, content)
    }
  )
}
