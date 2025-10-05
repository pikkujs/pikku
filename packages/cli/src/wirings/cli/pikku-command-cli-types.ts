import {
  logCommandInfoAndTime,
  writeFileInDir,
  getFileImportRelativePath,
} from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'
import { serializeCLITypes } from './serialize-cli-types.js'

export const pikkuCLITypes: PikkuCommandWithoutState = async (
  logger,
  { cliTypesFile, functionTypesFile, packageMappings }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating CLI types',
    'Created CLI types',
    [false],
    async () => {
      const functionTypesImportPath = getFileImportRelativePath(
        cliTypesFile,
        functionTypesFile,
        packageMappings
      )
      const content = serializeCLITypes(functionTypesImportPath)
      await writeFileInDir(logger, cliTypesFile, content)
    }
  )
}
