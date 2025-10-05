import {
  getFileImportRelativePath,
  getPikkuFilesAndMethods,
  logCommandInfoAndTime,
  writeFileInDir,
} from '../../utils.js'
import { serializeFunctionTypes } from './serialize-function-types.js'
import { PikkuCommand } from '../../types.js'

export const pikkuFunctionTypesSplit: PikkuCommand = async (
  logger,
  { functionTypesFile, packageMappings, rpcInternalMapDeclarationFile },
  visitState,
  options = {}
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating function types',
    'Created function types',
    [false],
    async () => {
      const { userSessionType, sessionServicesType, singletonServicesType } =
        await getPikkuFilesAndMethods(
          logger,
          visitState,
          packageMappings,
          functionTypesFile,
          options,
          {
            userSessionType: true,
            sessionServiceType: true,
            singletonServicesType: true,
          }
        )

      const content = serializeFunctionTypes(
        `import type { ${userSessionType.type} } from '${getFileImportRelativePath(functionTypesFile, userSessionType.typePath, packageMappings)}'`,
        userSessionType.type,
        `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(functionTypesFile, singletonServicesType.typePath, packageMappings)}'`,
        singletonServicesType.type,
        `import type { ${sessionServicesType.type} } from '${getFileImportRelativePath(functionTypesFile, sessionServicesType.typePath, packageMappings)}'`,
        sessionServicesType.type,
        `import type { TypedPikkuRPC } from '${getFileImportRelativePath(functionTypesFile, rpcInternalMapDeclarationFile, packageMappings)}'`
      )

      await writeFileInDir(logger, functionTypesFile, content)
    }
  )
}
