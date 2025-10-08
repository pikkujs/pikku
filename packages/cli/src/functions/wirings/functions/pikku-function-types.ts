import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import {
  getFileImportRelativePath,
  getPikkuFilesAndMethods,
  writeFileInDir,
} from '../../../utils/utils.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePikkuTypes } from '../../../services/serialize-pikku-types.js'

export const pikkuFunctionTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      typesDeclarationFile: typesFile,
      packageMappings,
      rpcInternalMapDeclarationFile,
    } = cliConfig

    const { userSessionType, sessionServicesType, singletonServicesType } =
      await getPikkuFilesAndMethods(
        logger,
        visitState,
        packageMappings,
        typesFile,
        {},
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
      sessionServicesType.type,
      `import type { TypedPikkuRPC } from '${getFileImportRelativePath(typesFile, rpcInternalMapDeclarationFile, packageMappings)}'`
    )
    await writeFileInDir(logger, typesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating api types',
      commandEnd: 'Created api types',
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})
