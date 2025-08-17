import {
  getFileImportRelativePath,
  getPikkuFilesAndMethods,
  logCommandInfoAndTime,
  writeFileInDir,
} from '../../utils.js'
import { serializePikkuTypes } from '../../serialize-pikku-types.js'
import { PikkuCommand } from '../../types.js'

export const pikkuFunctionTypes: PikkuCommand = async (
  logger,
  {
    typesDeclarationFile: typesFile,
    packageMappings,
    rpcInternalMapDeclarationFile,
  },
  visitState,
  options = {}
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating api types',
    'Created api types',
    [false],
    async () => {
      const { userSessionType, sessionServicesType, singletonServicesType } =
        await getPikkuFilesAndMethods(
          logger,
          visitState,
          packageMappings,
          typesFile,
          options,
          {
            userSessionType: true,
            sessionServiceType: true,
            singletonServicesType: true,
          }
        )

      const content = serializePikkuTypes(
        `import type { ${userSessionType.type} } from '${getFileImportRelativePath(typesFile, userSessionType.typePath, packageMappings)}'`,
        userSessionType.type,
        `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(typesFile, singletonServicesType.typePath, packageMappings)}'`,
        singletonServicesType.type,
        `import type { ${sessionServicesType.type} } from '${getFileImportRelativePath(typesFile, sessionServicesType.typePath, packageMappings)}'`,
        `import type { TypedPikkuRPC } from '${getFileImportRelativePath(typesFile, rpcInternalMapDeclarationFile, packageMappings)}'`
      )
      await writeFileInDir(logger, typesFile, content)
    }
  )
}
