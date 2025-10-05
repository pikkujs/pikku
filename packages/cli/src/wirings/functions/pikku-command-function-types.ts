import {
  getFileImportRelativePath,
  logCommandInfoAndTime,
  writeFileInDir,
} from '../../utils.js'
import { serializePikkuTypesHub } from '../../serialize-pikku-types-hub.js'
import { PikkuCommand } from '../../types.js'

export const pikkuFunctionTypes: PikkuCommand = async (
  logger,
  {
    typesDeclarationFile: typesFile,
    packageMappings,
    functionTypesFile,
    httpTypesFile,
    channelsTypesFile,
    schedulersTypesFile,
    queueTypesFile,
    mcpTypesFile,
    cliTypesFile,
  },
  _visitState,
  _options = {}
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating api types hub',
    'Created api types hub',
    [false],
    async () => {
      const content = serializePikkuTypesHub(
        getFileImportRelativePath(
          typesFile,
          functionTypesFile,
          packageMappings
        ),
        getFileImportRelativePath(typesFile, httpTypesFile, packageMappings),
        getFileImportRelativePath(
          typesFile,
          channelsTypesFile,
          packageMappings
        ),
        getFileImportRelativePath(
          typesFile,
          schedulersTypesFile,
          packageMappings
        ),
        getFileImportRelativePath(typesFile, queueTypesFile, packageMappings),
        getFileImportRelativePath(typesFile, mcpTypesFile, packageMappings),
        getFileImportRelativePath(typesFile, cliTypesFile, packageMappings)
      )

      await writeFileInDir(logger, typesFile, content)
    }
  )
}
